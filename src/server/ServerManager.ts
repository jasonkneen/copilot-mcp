import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ChildProcess, spawn } from 'child_process';
import { ServerConfig, ServerProcess, ServerEventType } from './ServerConfig';
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
            id: crypto.randomUUID()
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
        const newServer = { ...oldServer, ...updates };
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
     * @param server The server configuration
     */
    public async startServer(server: ServerConfig): Promise<void> {
        try {
            if (this._processes.has(server.id)) {
                if (this._logger) {
                    this._logger.warn(`Server ${server.name} is already running`);
                }
                return;
            }

            // Create output channel for the server
            const outputChannel = vscode.window.createOutputChannel(`MCP Server: ${server.name}`);
            outputChannel.show();
            outputChannel.appendLine(`Starting server: ${server.name}`);
            outputChannel.appendLine(`Command: ${server.command}`);

            // Parse command and arguments
            const [cmd, ...args] = server.command.split(' ');

            // Spawn the process with environment variables
            const serverProcess = spawn(cmd, args, {
                stdio: 'pipe',
                shell: true,
                env: {
                    ...globalThis.process.env, // Include current environment
                    ...(server.env || {}) // Override with server-specific environment variables
                }
            });

            // Store process and output channel
            this._processes.set(server.id, {
                process: serverProcess,
                outputChannel,
                tools: [],
                resources: []
            });

            // Handle process output
            serverProcess.stdout?.on('data', (data: Buffer) => {
                outputChannel.append(data.toString());
            });

            serverProcess.stderr?.on('data', (data: Buffer) => {
                outputChannel.append(data.toString());
            });

            // Handle process exit
            serverProcess.on('close', async (code: number | null) => {
                outputChannel.appendLine(`\nProcess exited with code ${code}`);

                // If the server was enabled but the process exited, update the state
                const currentServer = this._servers.find(s => s.id === server.id);
                if (currentServer?.enabled) {
                    currentServer.enabled = false;
                    await this.saveServers();

                    if (code !== 0) {
                        vscode.window.showErrorMessage(`Server "${currentServer.name}" crashed with exit code ${code}`);
                    }
                }

                // Clean up
                this._mcpClients.get(server.id)?.dispose();
                this._mcpClients.delete(server.id);
                this._processes.delete(server.id);

                // Emit server stopped event
                EventBus.emit({
                    type: ServerEventType.SERVER_STOPPED,
                    serverId: server.id
                });
            });

            // Handle process error
            serverProcess.on('error', (err: Error) => {
                outputChannel.appendLine(`\nProcess error: ${err.message}`);
                vscode.window.showErrorMessage(`Failed to start server "${server.name}": ${err.message}`);
            });

            // Wait a bit to see if the process starts successfully
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (serverProcess.exitCode !== null) {
                throw new Error(`Process exited immediately with code ${serverProcess.exitCode}`);
            }

            // Initialize MCP client
            await this._connectMCPClient(server.id, serverProcess, outputChannel);

            if (this._logger) {
                this._logger.log(`Server "${server.name}" started successfully`);
            }

            vscode.window.showInformationMessage(`Server "${server.name}" started successfully`);

            // Emit server started event
            EventBus.emit({
                type: ServerEventType.SERVER_STARTED,
                serverId: server.id
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to start server "${server.name}": ${errorMessage}`);

            // Clean up any partially started resources
            this._mcpClients.get(server.id)?.dispose();
            this._mcpClients.delete(server.id);

            const serverProcess = this._processes.get(server.id);
            if (serverProcess) {
                serverProcess.process.kill();
                serverProcess.outputChannel.dispose();
                this._processes.delete(server.id);
            }

            // Update server state
            const currentServer = this._servers.find(s => s.id === server.id);
            if (currentServer?.enabled) {
                currentServer.enabled = false;
                await this.saveServers();
            }

            ErrorHandler.handleError(`Start Server: ${server.name}`, error);
        }
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
     * Connect to the MCP server
     * @param serverId The server ID
     * @param process The child process
     * @param outputChannel The output channel
     */
    private async _connectMCPClient(serverId: string, process: ChildProcess, outputChannel: vscode.OutputChannel): Promise<void> {
        try {
            // Create MCP client wrapper
            const mcpClient = new MCPClientWrapper(serverId, process, outputChannel);

            // Connect client
            await mcpClient.connect();

            // Store client in map
            this._mcpClients.set(serverId, mcpClient);

            // Get initial tool list
            const tools = await mcpClient.listTools();
            outputChannel.appendLine(`Retrieved ${tools.length} tools from server`);

            // Get initial resource list
            const resources = await mcpClient.listResources();

            // Store tools and resources in server process
            const serverProcess = this._processes.get(serverId);
            if (!serverProcess) { return; }

            serverProcess.tools = tools;
            serverProcess.resources = resources;

            // Emit tools changed event
            if (tools.length > 0) {
                EventBus.emit({
                    type: ServerEventType.TOOLS_CHANGED,
                    serverId,
                    data: { tools }
                });
            }

            // Emit resources changed event
            if (resources.length > 0) {
                EventBus.emit({
                    type: ServerEventType.RESOURCES_CHANGED,
                    serverId,
                    data: { resources }
                });
            }
        } catch (error) {
            ErrorHandler.handleError('Connect MCP Client', error, outputChannel);
            throw error;
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