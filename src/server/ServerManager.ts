import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { ServerConfig, ServerType, ServerProcess, ServerEventType, ServerEvent } from './ServerConfig';
import { MCPClientWrapper } from '../mcp/MCPClientWrapper';
import { ErrorHandler } from '../utils/ErrorHandler';
import { EventBus } from '../utils/EventBus';
import { Logger } from '../utils/Logger';
import { ToolManager } from '../managers/ToolManager';
import { ResourceManager } from '../managers/ResourceManager';

/**
 * Manages MCP server instances
 */
export class ServerManager {
    private _servers: ServerConfig[] = [];
    private _processes: Map<string, ServerProcess> = new Map();
    private _mcp: Map<string, MCPClientWrapper> = new Map();
    private _eventBus: EventBus;
    private _logger?: Logger;
    
    /**
     * Create a new ServerManager
     * @param context The extension context
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _toolManager?: ToolManager,
        private readonly _resourceManager?: ResourceManager
    ) {
        this._eventBus = EventBus.getInstance();
        
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }
    }
    
    /**
     * Load servers from configuration
     */
    public async loadServers(): Promise<ServerConfig[]> {
        const config = vscode.workspace.getConfiguration('mcpManager');
        this._servers = config.get<ServerConfig[]>('servers', []);
        
        // Ensure all servers have a type (for backward compatibility)
        for (const server of this._servers) {
            if (!server.type) {
                server.type = ServerType.PROCESS;
            }
        }
        
        this._log(`Loaded ${this._servers.length} servers from configuration`);
        
        return this._servers;
    }
    
    /**
     * Save servers to configuration
     */
    public async saveServers(): Promise<void> {
        const config = vscode.workspace.getConfiguration('mcpManager');
        await config.update('servers', this._servers, vscode.ConfigurationTarget.Global);
        
        this._log(`Saved ${this._servers.length} servers to configuration`);
    }
    
    /**
     * Get all servers
     */
    public getServers(): ServerConfig[] {
        return [...this._servers];
    }
    
    /**
     * Get a server by ID
     * @param id The server ID
     */
    public getServer(id: string): ServerConfig | undefined {
        return this._servers.find(s => s.id === id);
    }
    
    /**
     * Add a new server
     * @param server The server config
     */
    public async addServer(server: ServerConfig): Promise<void> {
        this._servers.push(server);
        await this.saveServers();
        
        this._log(`Added server ${server.id} (${server.name})`);
    }
    
    /**
     * Update a server
     * @param server The updated server config
     */
    public async updateServer(server: ServerConfig): Promise<void> {
        const index = this._servers.findIndex(s => s.id === server.id);
        if (index === -1) {
            throw new Error(`Server ${server.id} not found`);
        }
        
        const oldServer = this._servers[index];
        this._servers[index] = server;
        
        // If the server was running and its command changed, restart it
        if (this._processes.has(server.id) && oldServer.command !== server.command) {
            await this.stopServer(server.id);
            if (server.enabled) {
                await this.startServer(server);
            }
        }
        
        await this.saveServers();
        
        this._log(`Updated server ${server.id} (${server.name})`);
    }
    
    /**
     * Remove a server
     * @param id The server ID
     */
    public async removeServer(id: string): Promise<void> {
        if (this._processes.has(id)) {
            await this.stopServer(id);
        }
        
        const index = this._servers.findIndex(s => s.id === id);
        if (index !== -1) {
            this._servers.splice(index, 1);
            await this.saveServers();
            
            this._log(`Removed server ${id}`);
        }
    }
    
    /**
     * Start all enabled servers
     */
    public async startEnabledServers(): Promise<void> {
        this._log('Starting all enabled servers...');
        
        for (const server of this._servers) {
            if (server.enabled) {
                try {
                    await this.startServer(server);
                } catch (error) {
                    ErrorHandler.handleError(`Start server ${server.id} (${server.name})`, error);
                }
            }
        }
    }
    
    /**
     * Start a server
     * @param server The server to start
     */
    public async startServer(server: ServerConfig): Promise<void> {
        if (this._processes.has(server.id)) {
            this._log(`Server ${server.id} already running`);
            return;
        }
        
        try {
            this._log(`Starting server ${server.id} (${server.name})`);
            
            // Process-based server
            if (!server.type || server.type === ServerType.PROCESS) {
                await this._startProcessServer(server);
            } 
            // Server-Sent Events (SSE) server
            else if (server.type === ServerType.SSE) {
                await this._startSSEServer(server);
            }
            else {
                throw new Error(`Unsupported server type: ${server.type}`);
            }
            
            // Emit server started event
            this._eventBus.emit(ServerEventType.SERVER_STARTED, {
                type: ServerEventType.SERVER_STARTED,
                serverId: server.id
            } as ServerEvent);
            
        } catch (error) {
            ErrorHandler.handleError(`Start server ${server.id} (${server.name})`, error);
            throw error;
        }
    }
    
    /**
     * Start a process-based server
     * @param server The server to start
     */
    private async _startProcessServer(server: ServerConfig): Promise<void> {
        // Create output channel
        const outputChannel = vscode.window.createOutputChannel(`MCP Server: ${server.name}`);
        outputChannel.show();
        outputChannel.appendLine(`Starting server: ${server.name}`);
        outputChannel.appendLine(`Command: ${server.command}`);
        
        // Create environment with server-specific variables properly merged
        // Start with a fresh copy of the current process environment
        const envVars = { ...globalThis.process.env };
        
        // Add any server-specific environment variables
        if (server.env && Object.keys(server.env).length > 0) {
            outputChannel.appendLine(`Environment variables:`);
            for (const [key, value] of Object.entries(server.env)) {
                // Make sure the values are strings
                const strValue = String(value).trim();
                envVars[key.trim()] = strValue;
                outputChannel.appendLine(`  ${key}=${strValue}`);
            }
            
            // Special handling for FireCrawl API key - export it directly in the shell command
            // This is a workaround for tools that read env vars at startup time
            if (server.env.FIRECRAWL_API_KEY) {
                outputChannel.appendLine(`Detected FireCrawl API key - using export in shell command`);
                const apiKey = String(server.env.FIRECRAWL_API_KEY).trim();
                const shellPrefix = globalThis.process.platform === 'win32' 
                    ? `set FIRECRAWL_API_KEY=${apiKey} && ` 
                    : `export FIRECRAWL_API_KEY="${apiKey}" && `;
                server.command = shellPrefix + server.command;
                outputChannel.appendLine(`Modified command: ${server.command}`);
            }
        }
                
        // Spawn the process with the complete command and carefully merged environment
        // Use shell:true to ensure environment variables are properly passed through
        const childProcess = spawn(server.command, [], {
            stdio: 'pipe',
            shell: true,
            env: envVars,
            windowsVerbatimArguments: globalThis.process.platform === 'win32'
        });
        
        outputChannel.appendLine(`Process spawned with PID: ${childProcess.pid || 'unknown'}`);
        
        // Store process info
        this._processes.set(server.id, {
            process: childProcess,
            outputChannel,
            tools: [],
            resources: []
        });
        
        // Handle process output
        childProcess.stdout?.on('data', (data: Buffer) => {
            outputChannel.append(data.toString());
        });
        
        childProcess.stderr?.on('data', (data: Buffer) => {
            outputChannel.append(data.toString());
        });
        
        // Handle process exit
        childProcess.on('close', async (code: number | null) => {
            outputChannel.appendLine(`\nProcess exited with code ${code}`);
            
            // Clean up
            await this._cleanupServer(server.id);
            
            // Update server status if it was enabled
            const currentServer = this._servers.find(s => s.id === server.id);
            if (currentServer?.enabled) {
                currentServer.enabled = false;
                await this.saveServers();
                
                // Emit server stopped event
                this._eventBus.emit(ServerEventType.SERVER_STOPPED, {
                    type: ServerEventType.SERVER_STOPPED,
                    serverId: server.id,
                    data: { code }
                } as ServerEvent);
                
                if (code !== 0) {
                    vscode.window.showErrorMessage(`Server "${currentServer.name}" crashed with exit code ${code}`);
                }
            }
        });
        
        // Handle process error
        childProcess.on('error', (err: Error) => {
            outputChannel.appendLine(`\nProcess error: ${err.message}`);
            ErrorHandler.handleError(`Server process ${server.id} (${server.name})`, err);
        });
        
        // Wait for process to start
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if process is still running
        if (childProcess.exitCode !== null) {
            throw new Error(`Process exited immediately with code ${childProcess.exitCode}`);
        }
        
        // Initialize MCP client
        const mcpClient = new MCPClientWrapper(ServerType.PROCESS);
        await mcpClient.connectToProcess(childProcess);
        
        // Store MCP client
        this._mcp.set(server.id, mcpClient);
        
        // Update process with client
        const serverProcess = this._processes.get(server.id);
        if (!serverProcess) return;
        
        serverProcess.mcpClient = mcpClient.client;
        serverProcess.tools = mcpClient.tools;
        serverProcess.resources = mcpClient.resources;
        
        // Register tools and resources
        if (this._toolManager) {
            await this._toolManager.registerTools(server.id, mcpClient.client, mcpClient.tools);
        }
        
        if (this._resourceManager) {
            await this._resourceManager.registerResources(server.id, mcpClient.client, mcpClient.resources);
        }
        
        vscode.window.showInformationMessage(`Server "${server.name}" started successfully`);
    }
    
    /**
     * Start an SSE-based server
     * @param server The server to start
     */
    private async _startSSEServer(server: ServerConfig): Promise<void> {
        if (!server.url) {
            throw new Error('URL is required for SSE servers');
        }
        
        // Create output channel
        const outputChannel = vscode.window.createOutputChannel(`MCP Server: ${server.name}`);
        outputChannel.show();
        outputChannel.appendLine(`Connecting to SSE server: ${server.name}`);
        outputChannel.appendLine(`URL: ${server.url}`);
        
        // Initialize MCP client
        const mcpClient = new MCPClientWrapper(ServerType.SSE);
        
        try {
            // Connect to the SSE server
            await mcpClient.connectToSSE(server.url, server.authToken);
            
            // Create a dummy process object since we don't have a real child process
            const dummyProcess = {
                exitCode: null,
                spawnargs: [],
                kill: () => true
            } as any;
            
            // Store process info
            this._processes.set(server.id, {
                process: dummyProcess,
                outputChannel,
                mcpClient: mcpClient.client,
                tools: mcpClient.tools,
                resources: mcpClient.resources
            });
            
            // Store MCP client
            this._mcp.set(server.id, mcpClient);
            
            // Register tools and resources
            if (this._toolManager) {
                await this._toolManager.registerTools(server.id, mcpClient.client, mcpClient.tools);
            }
            
            if (this._resourceManager) {
                await this._resourceManager.registerResources(server.id, mcpClient.client, mcpClient.resources);
            }
            
            vscode.window.showInformationMessage(`Server "${server.name}" connected successfully`);
            
        } catch (error) {
            outputChannel.appendLine(`Failed to connect to SSE server: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    
    /**
     * Stop a server
     * @param id The server ID
     */
    public async stopServer(id: string): Promise<void> {
        const serverProcess = this._processes.get(id);
        if (!serverProcess) {
            return;
        }
        
        try {
            this._log(`Stopping server ${id}`);
            
            // Cleanup server resources
            await this._cleanupServer(id);
            
            // Get the server for notifications
            const server = this._servers.find(s => s.id === id);
            
            // Emit server stopped event
            this._eventBus.emit(ServerEventType.SERVER_STOPPED, {
                type: ServerEventType.SERVER_STOPPED,
                serverId: id
            } as ServerEvent);
            
            if (server) {
                vscode.window.showInformationMessage(`Server "${server.name}" stopped successfully`);
            }
            
        } catch (error) {
            ErrorHandler.handleError(`Stop server ${id}`, error);
            throw error;
        }
    }
    
    /**
     * Clean up resources for a server
     * @param id The server ID
     */
    private async _cleanupServer(id: string): Promise<void> {
        // Unregister tools and resources
        if (this._toolManager) {
            this._toolManager.unregisterTools(id);
        }
        
        if (this._resourceManager) {
            this._resourceManager.unregisterResources(id);
        }
        
        // Get the server process
        const serverProcess = this._processes.get(id);
        if (!serverProcess) {
            return;
        }
        
        // Clean up MCP client
        const mcpClient = this._mcp.get(id);
        if (mcpClient) {
            try {
                await mcpClient.disconnect();
            } catch (error) {
                console.error('Error disconnecting MCP client:', error);
            }
            this._mcp.delete(id);
        }
        
        // Kill the process
        try {
            serverProcess.process.kill();
        } catch (error) {
            console.error('Error killing process:', error);
        }
        
        // Close the output channel
        serverProcess.outputChannel.appendLine('\nServer stopped');
        
        // Remove from the processes map
        this._processes.delete(id);
    }

    /**
     * Migrate server configurations to include type information
     * This is needed for backward compatibility
     * @returns Number of servers migrated
     */
    public async migrateServerConfigurations(): Promise<number> {
        let migratedCount = 0;
        
        for (const server of this._servers) {
            if (!server.type) {
                server.type = ServerType.PROCESS;
                migratedCount++;
            }
        }
        
        if (migratedCount > 0) {
            await this.saveServers();
            this._log(`Migrated ${migratedCount} server configurations to include type information`);
        }
        
        return migratedCount;
    }
    
    /**
     * Dispose resources
     */
    public dispose(): void {
        // Stop all running servers
        for (const serverId of this._processes.keys()) {
            this.stopServer(serverId).catch(error => {
                console.error(`Error stopping server ${serverId}:`, error);
            });
        }
    }
    
    /**
     * Log a message
     */
    private _log(message: string): void {
        if (this._logger) {
            this._logger.log(message);
        } else {
            console.log(message);
        }
    }
}