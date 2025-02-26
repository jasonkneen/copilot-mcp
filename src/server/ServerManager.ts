import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ChildProcess, spawn } from 'child_process';
import { ServerConfig, ServerProcess, ServerEventType, ServerType } from './ServerConfig';
import { MCPClientWrapper } from '../mcp/MCPClientWrapper';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { EventBus } from '../utils/EventBus';

/**
 * Manages the lifecycle of MCP servers
 */
export class ServerManager {
    private _servers: ServerConfig[] = [];
    private _processes: Map<string, ServerProcess> = new Map();
    private _mcpClients: Map<string, MCPClientWrapper> = new Map();
    private _logger?: Logger;

    /**
     * Creates a new server manager
     * @param context The extension context
     */
    constructor(private readonly context: vscode.ExtensionContext) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            console.log('Logger not initialized in ServerManager');
            // Logger not initialized
        }
    }

    /**
     * Load server configurations from workspace settings
     * @returns The loaded server configurations
     */
    public async loadServers(): Promise<ServerConfig[]> {
        try {
            const config = vscode.workspace.getConfiguration('mcpManager');
            this._servers = config.get<ServerConfig[]>('servers', []);

            if (this._logger) {
                this._logger.log(`Loaded ${this._servers.length} server configurations`);
            }

            return this._servers;
        } catch (error) {
            ErrorHandler.handleError('Load Servers', error);
            return [];
        }
    }

    /**
     * Save server configurations to workspace settings
     */
    public async saveServers(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('mcpManager');
            await config.update('servers', this._servers, vscode.ConfigurationTarget.Global);

            if (this._logger) {
                this._logger.log(`Saved ${this._servers.length} server configurations`);
            }
        } catch (error) {
            ErrorHandler.handleError('Save Servers', error);
        }
    }

    /**
     * Get all server configurations
     */
    public getServers(): ServerConfig[] {
        return [...this._servers];
    }

    /**
     * Get a server configuration by ID
     * @param serverId The server ID
     */
    public getServer(serverId: string): ServerConfig | undefined {
        return this._servers.find(s => s.id === serverId);
    }

    /**
     * Add a new server configuration
     * @param server The server configuration (without ID)
     * @returns The server configuration with generated ID
     */
    public async addServer(server: Omit<ServerConfig, 'id'>): Promise<ServerConfig> {
        const newServer: ServerConfig = {
            ...server,
            id: crypto.randomUUID(),
            type: server.type || ServerType.PROCESS // Default to PROCESS if type is undefined
        };

        this._servers.push(newServer);
        await this.saveServers();

        if (this._logger) {
            this._logger.log(`Added new server: ${newServer.name}`);
        }

        return newServer;
    }

    /**
     * Update a server configuration
     * @param serverId The server ID
     * @param updates The updates to apply
     * @returns The updated server configuration
     */
    public async updateServer(serverId: string, updates: Partial<ServerConfig>): Promise<ServerConfig | undefined> {
        const serverIndex = this._servers.findIndex(s => s.id === serverId);
        if (serverIndex === -1) {
            return undefined;
        }

        const oldServer = this._servers[serverIndex];
        
        // Ensure the server type remains defined after updates
        const updatedType = updates.type || oldServer.type || ServerType.PROCESS;
        
        const newServer = { 
            ...oldServer, 
            ...updates,
            type: updatedType
        };
        
        this._servers[serverIndex] = newServer;

        await this.saveServers();

        if (this._logger) {
            this._logger.log(`Updated server: ${newServer.name}`);
        }

        // If server was running and command or env changed, restart it
        if (this._processes.has(serverId) &&
            (updates.command !== oldServer.command || updates.env !== oldServer.env)) {
            if (newServer.enabled) {
                await this.restartServer(serverId);
            } else {
                await this.stopServer(serverId);
            }
        }
        // If enabled state changed, start or stop the server
        else if (oldServer.enabled !== newServer.enabled) {
            if (newServer.enabled) {
                await this.startServer(newServer);
            } else {
                await this.stopServer(serverId);
            }
        }

        return newServer;
    }

    /**
     * Remove a server configuration
     * @param serverId The server ID
     */
    public async removeServer(serverId: string): Promise<boolean> {
        // Stop the server if running
        await this.stopServer(serverId);

        const serverIndex = this._servers.findIndex(s => s.id === serverId);
        if (serverIndex === -1) {
            return false;
        }

        const server = this._servers[serverIndex];
        this._servers.splice(serverIndex, 1);
        await this.saveServers();

        if (this._logger) {
            this._logger.log(`Removed server: ${server.name}`);
        }

        return true;
    }

    /**
     * Start a server
     * @param server The server to start
     */
    public async startServer(server: ServerConfig): Promise<void> {
        try {
            if (this._processes.has(server.id)) {
                if (this._logger) {
                    this._logger.log(`Server ${server.id} is already running`);
                }
                return;
            }

            if (this._logger) {
                this._logger.log(`Starting server ${server.id}...`);
            }

            // Create an output channel for the server
            const outputChannel = vscode.window.createOutputChannel(`MCP Server: ${server.name}`);
            outputChannel.show();
            outputChannel.appendLine(`Starting MCP server: ${server.name}...`);

            // Ensure server type is defined (default to PROCESS for backward compatibility)
            const serverType = server.type || ServerType.PROCESS;

            // Different handling based on server type
            if (serverType === ServerType.PROCESS) {
                await this._startProcessServer(server, outputChannel);
            } else if (serverType === ServerType.SSE) {
                await this._startSSEServer(server, outputChannel);
            } else {
                throw new Error(`Unsupported server type: ${serverType}`);
            }

            // Output startup confirmation
            outputChannel.appendLine(`MCP server ${server.name} started and connected`);

            if (this._logger) {
                this._logger.log(`Server ${server.id} started successfully`);
            }

            // Emit server started event
            EventBus.emit({
                type: ServerEventType.SERVER_STARTED,
                serverId: server.id
            });
        } catch (error) {
            ErrorHandler.handleError(`Start Server ${server.name}`, error);
            vscode.window.showErrorMessage(`Failed to start MCP server ${server.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Start a process-based server
     * @param server The server to start
     * @param outputChannel The output channel for logs
     */
    private async _startProcessServer(server: ServerConfig, outputChannel: vscode.OutputChannel): Promise<void> {
        if (!server.command) {
            throw new Error('Server command is required for process servers');
        }

        // Parse the command
        const commandParts = server.command.trim().split(/\s+/);
        const command = commandParts[0];
        const args = commandParts.slice(1);

        // Start the server process
        outputChannel.appendLine(`Starting process with command: ${server.command}`);
        
        // Create environment for the process with system env and user-defined env
        const processEnv = { ...process.env, ...server.env };
        
        // Start the process
        const serverProcess = spawn(command, args, {
            env: processEnv,
            shell: true
        });

        // Store the server process
        this._processes.set(server.id, {
            process: serverProcess,
            outputChannel,
            tools: [],
            resources: []
        });

        // Setup process event handlers
        this._setupProcessEventHandlers(server.id, serverProcess, outputChannel);

        // Connect to the server via MCP
        await this._connectMCPClient(server.id, serverProcess, outputChannel);
    }

    /**
     * Setup event handlers for a server process
     * @param serverId The server ID
     * @param process The child process
     * @param outputChannel The output channel for logs
     */
    private _setupProcessEventHandlers(serverId: string, process: ChildProcess, outputChannel: vscode.OutputChannel): void {
        // Handle process output
        process.stdout?.on('data', (data: Buffer) => {
            outputChannel.append(data.toString());
        });

        process.stderr?.on('data', (data: Buffer) => {
            outputChannel.append(data.toString());
        });

        // Handle process exit
        process.on('close', async (code: number | null) => {
            outputChannel.appendLine(`\nProcess exited with code ${code}`);

            // If the server was enabled but the process exited, update the state
            const currentServer = this._servers.find(s => s.id === serverId);
            if (currentServer?.enabled) {
                currentServer.enabled = false;
                await this.saveServers();

                if (code !== 0) {
                    vscode.window.showErrorMessage(`Server "${currentServer.name}" crashed with exit code ${code}`);
                }
            }

            // Clean up
            this._mcpClients.get(serverId)?.dispose();
            this._mcpClients.delete(serverId);
            this._processes.delete(serverId);

            // Emit server stopped event
            EventBus.emit({
                type: ServerEventType.SERVER_STOPPED,
                serverId: serverId
            });
        });

        // Handle process error
        process.on('error', (err: Error) => {
            outputChannel.appendLine(`\nProcess error: ${err.message}`);
            vscode.window.showErrorMessage(`Failed to start server: ${err.message}`);
        });
    }

    /**
     * Start an SSE server
     * @param server The server to start
     * @param outputChannel The output channel for logs
     */
    private async _startSSEServer(server: ServerConfig, outputChannel: vscode.OutputChannel): Promise<void> {
        if (!server.url) {
            throw new Error('Server URL is required for SSE servers');
        }

        outputChannel.appendLine(`Connecting to SSE server at ${server.url}...`);

        // For SSE servers, we don't have a process, but we still need to create a server entry
        this._processes.set(server.id, {
            process: undefined as any, // This is a placeholder
            outputChannel,
            tools: [],
            resources: []
        });

        // Connect to the server via MCP with SSE transport
        await this._connectSSEClient(server.id, server.url, server.authToken, outputChannel);
    }

    /**
     * Stop a running server
     * @param serverId The server ID
     */
    public async stopServer(serverId: string): Promise<void> {
        const serverProcess = this._processes.get(serverId);
        if (!serverProcess) {
            return;
        }

        try {
            const server = this._servers.find(s => s.id === serverId);

            // Clean up MCP client
            const mcpClient = this._mcpClients.get(serverId);
            if (mcpClient) {
                mcpClient.dispose();
                this._mcpClients.delete(serverId);
            }

            const { process, outputChannel } = serverProcess;

            // Send SIGTERM to the process
            process.kill();

            // Wait for the process to exit
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    process.kill('SIGKILL');
                    resolve();
                }, 5000);

                process.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            outputChannel.appendLine('\nServer stopped');
            this._processes.delete(serverId);

            if (server) {
                vscode.window.showInformationMessage(`Server "${server.name}" stopped successfully`);
            }

            // Emit server stopped event
            EventBus.emit({
                type: ServerEventType.SERVER_STOPPED,
                serverId
            });
        } catch (error) {
            const server = this._servers.find(s => s.id === serverId);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Error stopping server "${server?.name}": ${errorMessage}`);

            ErrorHandler.handleError(`Stop Server: ${server?.name}`, error);
        }
    }

    /**
     * Restart a running server
     * @param serverId The server ID
     */
    public async restartServer(serverId: string): Promise<void> {
        const server = this._servers.find(s => s.id === serverId);
        if (!server) {
            return;
        }

        await this.stopServer(serverId);
        await this.startServer(server);
    }

    /**
     * Start all enabled servers
     */
    public async startEnabledServers(): Promise<void> {
        const enabledServers = this._servers.filter(server => server.enabled);
        for (const server of enabledServers) {
            try {
                await this.startServer(server);
            } catch (error) {
                ErrorHandler.handleError(`Auto-start Server: ${server.name}`, error);
            }
        }
    }

    /**
     * Check if a server is running
     * @param serverId The server ID
     */
    public isServerRunning(serverId: string): boolean {
        return this._processes.has(serverId);
    }

    /**
     * Get process info for a running server
     * @param serverId The server ID
     */
    public getServerProcess(serverId: string): ServerProcess | undefined {
        return this._processes.get(serverId);
    }

    /**
     * Get MCP client for a running server
     * @param serverId The server ID
     */
    public getMCPClient(serverId: string): MCPClientWrapper | undefined {
        return this._mcpClients.get(serverId);
    }

    /**
     * Connect to a server using MCP
     * @param serverId The server ID
     * @param process The child process running the server
     * @param outputChannel The output channel for logging
     */
    private async _connectMCPClient(
        serverId: string, 
        process: ChildProcess, 
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        try {
            outputChannel.appendLine('Initializing MCP client...');
            
            // Create MCP client
            const mcpClient = new MCPClientWrapper(
                serverId,
                ServerType.PROCESS,
                process,
                outputChannel
            );

            // Connect to the server
            await mcpClient.connect();
            
            // Store the MCP client
            this._mcpClients.set(serverId, mcpClient);
            
            // Update the ServerProcess record
            const serverProcess = this._processes.get(serverId);
            if (serverProcess) {
                // Fetch and store tools
                const tools = await mcpClient.listTools();
                serverProcess.tools = tools;
                
                // Emit tools changed event
                EventBus.emit({
                    type: ServerEventType.TOOLS_CHANGED,
                    serverId: serverId,
                    data: { tools }
                });
                
                try {
                    // Get resources (may not be supported by all servers)
                    const resources = await mcpClient.listResources();
                    serverProcess.resources = resources;
                    
                    // Emit resources changed event
                    EventBus.emit({
                        type: ServerEventType.RESOURCES_CHANGED,
                        serverId: serverId,
                        data: { resources }
                    });
                } catch (resourceError) {
                    // Resources might not be supported, that's ok
                    outputChannel.appendLine('Note: This MCP server does not support resource listing');
                }
            }
        } catch (error) {
            ErrorHandler.handleError('Connect MCP Client', error, outputChannel);
            throw error;
        }
    }

    /**
     * Connect to a server using MCP with SSE transport
     * @param serverId The server ID
     * @param url The SSE server URL
     * @param authToken Optional authentication token
     * @param outputChannel The output channel for logging
     */
    private async _connectSSEClient(
        serverId: string, 
        url: string,
        authToken: string | undefined, 
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        try {
            outputChannel.appendLine('Initializing MCP client for SSE server...');
            
            // Create MCP client with SSE transport
            const mcpClient = new MCPClientWrapper(
                serverId,
                ServerType.SSE,
                undefined,
                outputChannel,
                url,
                authToken
            );

            // Connect to the server
            await mcpClient.connect();
            
            // Store the MCP client
            this._mcpClients.set(serverId, mcpClient);
            
            // Update the ServerProcess record
            const serverProcess = this._processes.get(serverId);
            if (serverProcess) {
                // Fetch and store tools/resources
                const tools = await mcpClient.listTools();
                serverProcess.tools = tools;
                
                // Emit tools changed event
                EventBus.emit({
                    type: ServerEventType.TOOLS_CHANGED,
                    serverId: serverId,
                    data: { tools }
                });
                
                try {
                    // Get resources (may not be supported by all servers)
                    const resources = await mcpClient.listResources();
                    serverProcess.resources = resources;
                    
                    // Emit resources changed event
                    EventBus.emit({
                        type: ServerEventType.RESOURCES_CHANGED,
                        serverId: serverId,
                        data: { resources }
                    });
                } catch (resourceError) {
                    // Resources might not be supported, that's ok
                    outputChannel.appendLine('Note: This MCP server does not support resource listing');
                }
            }
        } catch (error) {
            outputChannel.appendLine(`Failed to connect to MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // Clean up the server process entry if it exists
            if (this._processes.has(serverId)) {
                this._processes.delete(serverId);
            }
            
            throw error;
        }
    }

    /**
     * Migrate server configurations to ensure they have proper type information
     * This helps transition servers created before SSE support was added
     * @returns The number of migrated servers
     */
    public async migrateServerConfigurations(): Promise<number> {
        try {
            let migratedCount = 0;
            const updatedServers = this._servers.map(server => {
                // Skip servers that already have a type defined
                if (server.type !== undefined) {
                    return server;
                }
                
                // Migrate server to explicitly set type to PROCESS
                migratedCount++;
                
                if (this._logger) {
                    this._logger.log(`Migrating server '${server.name}' to explicit PROCESS type`);
                }
                
                return {
                    ...server,
                    type: ServerType.PROCESS
                };
            });
            
            if (migratedCount > 0) {
                this._servers = updatedServers;
                await this.saveServers();
                
                if (this._logger) {
                    this._logger.log(`Migration complete: Updated ${migratedCount} server configurations to explicit types`);
                }
            }
            
            return migratedCount;
        } catch (error) {
            ErrorHandler.handleError('Server Configuration Migration', error);
            return 0;
        }
    }

    /**
     * Dispose and clean up resources
     */
    public dispose(): void {
        // Stop all running servers
        const serverIds = [...this._processes.keys()];
        for (const serverId of serverIds) {
            try {
                this.stopServer(serverId);
            } catch (error) {
                console.error(`Error stopping server ${serverId}:`, error);
            }
        }

        // Dispose all output channels
        for (const { outputChannel } of this._processes.values()) {
            outputChannel.dispose();
        }

        this._processes.clear();
        this._mcpClients.clear();
    }
} 