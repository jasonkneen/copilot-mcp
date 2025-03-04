import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ErrorHandler } from '../utils/ErrorHandler';
import { Tool, Resource } from '@modelcontextprotocol/sdk/types';
import { EventBus } from '../utils/EventBus';
import { ServerConfig, ServerEventType, ServerType } from '../server/ServerConfig';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { installDynamicToolsExt, unregisterServerTools, uninstallToolsExtension } from '@/tools';
import { v4 as uuidv4 } from 'uuid';
/**
 * WebviewProvider for the MCP Server Manager UI
 */
export class ServerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mcpsxServerView';
    private _view?: vscode.WebviewView;
    private _logger?: Logger;
    private readonly configPath = path.join(os.homedir(), '.mcpsx', 'config.json');
    private _instancesStatusProvider?: any;

    /**
     * Read server configurations from ~/.mcpsx/config.json
     * @returns Array of server configurations
     */
    private _readServersFromFile(): ServerConfig[] {
        try {
            // Check if file exists
            if (fs.existsSync(this.configPath)) {
                // Read and parse the file
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(configData);
                
                // Extract servers array
                if (config && config.servers && Array.isArray(config.servers)) {
                    console.log(`Successfully read server configuration from ${this.configPath}`);
                    return config.servers;
                }
            }
            
            // File doesn't exist or doesn't contain servers
            return [];
        } catch (error) {
            console.error(`Error reading config from ${this.configPath}: ${error}`);
            return [];
        }
    }

    /**
     * Update instances status in the webview
     * @param statusData Status data to send to the webview
     */
    public updateInstancesStatus(statusData: any): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateInstancesStatus',
                data: statusData
            });
        }
    }
    
    /**
     * Get the instances status provider
     */
    private _getInstancesStatusProvider() {
        return this._instancesStatusProvider;
    }
    
    /**
     * Set the instances status provider
     */
    public setInstancesStatusProvider(provider: any) {
        this._instancesStatusProvider = provider;
    }
    
    /**
     * Save server configurations to ~/.mcpsx/config.json
     * @param servers Array of server configurations to save
     */
    private _saveServersToFile(servers: ServerConfig[]): void {
        try {
            // Ensure directory exists
            console.log(`[SAVE DEBUG] Attempting to save ${servers.length} servers to ${this.configPath}`);
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                console.log(`[SAVE DEBUG] Creating directory: ${configDir}`);
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // Write the config file
            console.log(`[SAVE DEBUG] Writing server configuration to file`);
            console.log(`[SAVE DEBUG] Server data: ${JSON.stringify(servers, null, 2)}`);
            fs.writeFileSync(this.configPath, JSON.stringify({ servers }, null, 2));
            console.log(`Successfully saved server configuration to ${this.configPath}`);

            // Verify the file was written correctly by reading it back
            try {
                const savedData = fs.readFileSync(this.configPath, 'utf8');
                const savedConfig = JSON.parse(savedData);
                console.log(`[SAVE DEBUG] Verification - Read back ${savedConfig.servers?.length || 0} servers from file`);

                // Log the first server for verification
                if (savedConfig.servers && savedConfig.servers.length > 0) {
                    console.log(`[SAVE DEBUG] First server in saved file: ${JSON.stringify(savedConfig.servers[0])}`);
                }
            } catch (verifyError) {
                console.error(`[SAVE DEBUG] Error verifying saved file: ${verifyError}`);
            }
        } catch (error) {
            console.error(`[SAVE DEBUG] ERROR saving config to ${this.configPath}: ${error}`);
            if (error instanceof Error) {
                console.error(`[SAVE DEBUG] Error stack: ${error.stack}`);
            }
            // Rethrow to ensure calling code knows about the failure
            throw error;
        }
    }

    /**
     * Creates a new server view provider
     * @param context The extension context
     * @param clientManager The client manager instance
     */
    // Store a mapping of server IDs to clients for better tracking
    private clientMap: Map<string, Client> = new Map();
    
    /**
     * Normalize a server name for consistent comparison
     * This helps with case-insensitive matching and handling different naming conventions
     * @param name The server name to normalize
     * @returns The normalized server name
     */
    private _normalizeServerName(name: string): string {
        // Convert to lowercase and remove any non-alphanumeric characters
        // This will make "Memory", "memory", "memory-server" all match
        const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        console.log(`[SERVER NAME DEBUG] Normalized "${name}" to "${normalized}"`);
        return normalized;
    }
    
    constructor(
        private readonly context: vscode.ExtensionContext,
        private clients: Client[]
    ) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }

        // Initialize the client mapping
        this._initializeClientMap();

        // Listen for server events and update the UI accordingly
        this._setupEventListeners();
        
        // Listen for configuration changes
        this._setupConfigurationListener();
    }
    
    /**
     * Initialize the mapping of server IDs to clients
     */
    private _initializeClientMap(): void {
        // Get the server configs to find IDs
        const servers = this._readServersFromFile();
        
        console.log('==== SERVER DEBUG INFO ====');
        console.log('==== SERVER NAME MATCHING DEBUG ====');
        console.log('Initializing client map from', this.clients.length, 'clients and', servers.length, 'server configs');
        console.log('Available servers:', JSON.stringify(servers, null, 2));
        console.log('Available clients:', this.clients.map(c => {
            const version = c.getServerVersion();
            console.log(`Client name: "${version?.name}", id: "${version?.id || 'none'}", version: "${version?.version || 'none'}"`);
            console.log(`Client full version info:`, JSON.stringify(version, null, 2));
            return {
                id: version?.id,
                name: version?.name,
                version: version
            };
        }));
        
        // For each client, try to find its matching server config by name
        for (const client of this.clients) {
            const clientName = client.getServerVersion()?.name;
            const clientPackageId = client.getServerVersion()?.id; // Get the package ID from the server manifest
            if (!clientName) {
                console.warn('Client has no name, skipping mapping');
                continue;
            }
            
            // Find the server config with matching name
            const normalizedClientName = this._normalizeServerName(clientName);
            console.log(`Looking for server config matching normalized client name: "${normalizedClientName}" (original: "${clientName}")`);
            console.log(`Client package ID: ${clientPackageId || 'not available'}`);
            
            // Log all server names and their normalized versions for comparison
            servers.forEach(s => {
                console.log(`Server config: "${s.name}", normalized: "${this._normalizeServerName(s.name)}"`);
            });
            
            // First try to find by exact name match, then fall back to normalized name
            // If client has a package ID, prioritize matching by that
            let serverConfig = null;
            if (clientPackageId) {
                // Try to find a server with a matching package ID
                serverConfig = servers.find(s => s.id === clientPackageId);
                console.log(`Server match by package ID: ${!!serverConfig}`);
            }
            serverConfig = serverConfig || servers.find(s => s.name === clientName) || 
                          servers.find(s => s.name === clientName + "-server") ||
                          servers.find(s => s.name === clientName.replace("-server", "")) ||
                          servers.find(s => this._normalizeServerName(s.name) === normalizedClientName);
            
            // Add debug logging for the matching process
            if (serverConfig) {
                console.log(`[SERVER MATCH DEBUG] Found server config for client "${clientName}":`, {
                    matchedServerName: serverConfig.name,
                    matchedServerId: serverConfig.id
                });
            }
            if (!serverConfig) {
                console.warn(`No server config found for client: ${clientName} (normalized: ${normalizedClientName})`);
                // Create a temporary UUID for this client - this will be used for server ID matching
                const tempId = uuidv4();
                console.log(`Creating temporary ID ${tempId} for client ${clientName}`);
                this.clientMap.set(tempId, client);
                continue;
            }
            
            // Map the server ID to this client
            console.log(`Mapping server ID ${serverConfig.id} to client ${clientName} (normalized: ${normalizedClientName})`);
            this.clientMap.set(serverConfig.id, client);
        }
        
        console.log('Final client map:', Array.from(this.clientMap.entries()));
        console.log('==== END SERVER NAME MATCHING DEBUG ====');
        console.log('==== END SERVER DEBUG INFO ====');
    }
    
    /**
     * Set up a listener for configuration changes
     */
    private _setupConfigurationListener(): void {
        // Listen for configuration changes and update UI
        // Instead of watching VS Code configuration, we could set up a file watcher
        // This is optional since we're directly reading/writing the file when needed
        
        // Create a file system watcher for the config file
        const fileWatcher = vscode.workspace.createFileSystemWatcher(this.configPath);
        
        // Watch for changes to the config file
        const fileChangeSubscription = fileWatcher.onDidChange(() => {
            console.log('mcpsx-run configuration file changed, updating UI...');
            
            // Force a reload of the configuration
            const servers = this._readServersFromFile();
            console.log(`Configuration changed: Found ${servers.length} servers:`, servers);
            
            if (this._view) {
                this._sendInitialState();
            }
        });
        
        // Also watch for creation of the config file (if it didn't exist before)
        const fileCreateSubscription = fileWatcher.onDidCreate(() => {
            console.log('mcpsx-run configuration file created, updating UI...');
                
            if (this._view) {
                this._sendInitialState();
            }
        });
        
        // Add subscription to context
        this.context.subscriptions.push(fileWatcher, fileChangeSubscription, fileCreateSubscription);
    }

    /**
     * Set up event listeners to update the UI based on server events
     */
    private _setupEventListeners(): void {
        // Listen for server events to update UI
        const eventBus = EventBus.getInstance();
        
        // Set up listeners for each event type
        const startedSubscription = eventBus.on(ServerEventType.SERVER_STARTED, (event: any) => {
            console.debug('[EVENT] Server started: ', event);
        });
        
        const stoppedSubscription = eventBus.on(ServerEventType.SERVER_STOPPED, (event: any) => {
            console.debug('[EVENT] Server stopped: ', event);
        });
        
        const toolsChangedSubscription = eventBus.on(ServerEventType.TOOLS_CHANGED, (event: any) => {
            console.debug('[EVENT] Tools changed: ', event);
            if (event.data?.tools) {
            }
        });
        
        const resourcesChangedSubscription = eventBus.on(ServerEventType.RESOURCES_CHANGED, (event: any) => {
            if (event.data?.resources) {
            }
        });
        
        // Add all subscriptions to context
        this.context.subscriptions.push(
            startedSubscription,
            stoppedSubscription,
            toolsChangedSubscription,
            resourcesChangedSubscription
        );
    }

    /**
     * Resolve the webview view
     * @param webviewView The webview view
     * @param context The webview context
     * @param token The cancellation token
     */
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): Promise<void> {
        this._view = webviewView;

        // Configure webview options
        webviewView.webview.options = {
            // Enable JavaScript in the webview
            enableScripts: true,
            // Restrict the webview to only load resources from the extension's directory
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ]
        };

        // Set the initial HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(this._handleMessage, this);

        // Send the initial server state to the webview
        this._sendInitialState();
    }

    /**
     * Send the initial server state to the webview
     */
    private async _sendInitialState(): Promise<void> {
        if (!this._view) {
            return;
        }

        try {
            // First get the servers from VSCode configuration to make sure we're in sync
            const configuredServers = this._readServersFromFile();
            
            console.log('Configured servers from VSCode settings:', configuredServers);
            
            // Refresh the client map to ensure it's up-to-date
            this._initializeClientMap();
            
            // Create a map of server IDs to their client information and dynamic properties
            const serverInfoMap = new Map();
            
            // First, process all configured servers to create a mapping of server ID to server config
            const serverIdToConfig = new Map<string, ServerConfig>();
            for (const server of configuredServers) {
                if (server.id) {
                    serverIdToConfig.set(server.id, server);
                    console.log(`[SERVER ID MAPPING] Added server ID mapping: ${server.id} -> ${server.name}`);
                }
            }

            // Process all clients and associate them with server IDs using the client map
            for (const [serverId, client] of this.clientMap.entries()) {
                try {
                    const serverConfig = serverIdToConfig.get(serverId);
                    if (!serverConfig) {
                        console.warn(`[SERVER ID MISMATCH] No server config found for ID: ${serverId}, skipping`);
                        continue;
                    }

                    const serverName = serverConfig.name;
                    console.log(`Processing client for server ID: ${serverId}, name: ${serverName}`);

                    let isConnected = false;
                    try {
                        console.log(`[SERVER STATUS DEBUG] Checking connection for server ${serverName} (ID: ${serverId}), enabled: ${serverConfig.enabled}`);
                        // Only attempt to ping if the server is enabled in configuration
                        if (serverConfig.enabled === false) {
                            console.log(`[SERVER STATUS DEBUG] Server ${serverName} is disabled in config, skipping ping`);
                            isConnected = false;
                        } else {
                            try {
                                // First try the ping method
                                const value = await client.ping();
                                console.log('MCP Server Ping: ', value);
                                isConnected = true;
                            } catch (pingError) {
                                console.log(`Ping failed, trying alternative check: ${pingError}`);
                                // If ping fails, try to list tools as an alternative way to check connection
                                try {
                                    const toolsResponse = await client.listTools();
                                    isConnected = true; // If we get here without error, server is connected
                                } catch (toolsError) {
                                    isConnected = false;
                                }
                            }
                        }
                    } catch(e) {
                        console.debug(`[SERVER STATUS DEBUG] Server ${serverName} ping failed:`, e);
                        isConnected = false;
                        
                        // Only show error notification if the server is enabled
                        // We don't want to show errors for intentionally disabled servers
                        if (serverConfig.enabled !== false && this._view) {
                            this._view.webview.postMessage({
                                type: 'error',
                                serverId: serverId,
                                message: `Server ${serverName} is unavailable: ${e instanceof Error ? e.message : 'Connection failed'}`
                            });
                        }
                    }
                    
                    let tools: Tool[] = [];
                    try {
                        console.log(`[PROVIDER DEBUG] Attempting to fetch tools for server ID ${serverId} (${serverName})...`);
                        const toolsResponse = await client.listTools();

                        console.log(`[PROVIDER DEBUG] Raw toolsResponse for ${serverName}:`, JSON.stringify(toolsResponse));

                        if (toolsResponse.tools) {
                            tools = [...toolsResponse.tools];
                            console.log(`[PROVIDER DEBUG] Found ${tools.length} tools for ${serverName}`);

                            // Log the first tool schema if available to debug
                            if (tools.length > 0) {
                                console.log(`[PROVIDER DEBUG] Example tool schema for ${serverName}:`,
                                    JSON.stringify(tools[0], null, 2));
                                console.log(`[PROVIDER DEBUG] Tool schema type: ${typeof tools[0].inputSchema}`);
                            } else {
                                console.warn(`[PROVIDER DEBUG] Tools array is empty for ${serverName}`);
                            }
                        } else {
                            console.warn(`[PROVIDER DEBUG] No tools found in response for ${serverName}`, toolsResponse);
                        }
                    } catch(e) {
                        console.warn(`Error fetching tools for ${serverName}:`, e);
                        console.debug('Server tools not available', e);
                    }
                    
                    let resources: Resource[] = [];
                    try {
                        const resourcesResponse = await client.listResources();
                        resources = [...resourcesResponse.resources];
                    } catch(e) {
                        console.debug(`Server resources not available for ${serverName}`);
                    }
                    
                    // Store using server ID for consistent lookup
                    serverInfoMap.set(serverId, {
                        name: serverName,
                        isConnected: isConnected,
                        tools,
                        resources
                    });
                    console.log(`[SERVER ID DEBUG] Stored server info with ID "${serverId}" (name: "${serverName}") with ${tools.length} tools and ${resources.length} resources`);
                } catch (error) {
                    console.error(`Error processing client for server ID ${serverId}:`, error);
                }
            }
            
            // Now, process the configured servers from settings
            // Define explicit type for servers array
            const servers: Array<ServerConfig & {
                tools: Tool[];
                resources: Resource[];
                isConnected: boolean;
            }> = [];
            
            // Include ALL configured servers, even if they don't have a running client
            for (const configServer of configuredServers) {
                if (!configServer.id) {
                    console.warn('Found server config without ID, skipping');
                    continue;
                }
                
                // Get dynamic info if we have a client for this server
                const serverId = configServer.id;
                const dynamicInfo = serverInfoMap.get(serverId) || {
                    isConnected: false,
                    tools: [],
                    resources: []
                };
                console.log(`[SERVER ID DEBUG] Looking up server info for ID "${serverId}" (name: "${configServer.name}") - found: ${!!serverInfoMap.get(serverId)}, tools: ${dynamicInfo.tools?.length || 0}`);
                
                // Build server object with all necessary data
                // IMPORTANT: Respect the enabled setting from configuration
                // Only use dynamicInfo for tools and resources
                servers.push({
                    ...configServer,
                    tools: dynamicInfo.tools || [],
                    resources: dynamicInfo.resources || [],
                    isConnected: dynamicInfo.isConnected || false,
                    // Ensure enabled state comes from configuration but defaults to true if not specified
                    enabled: configServer.enabled !== undefined ? configServer.enabled : true,
                    // Ensure these fields are always set with defaults if missing
                    name: configServer.name,
                    type: configServer.type || ServerType.PROCESS,
                    command: configServer.command || '',
                    url: configServer.url || '',
                    env: configServer.env || {}
                });
            }
            
            // First send the main server list
            console.log('Sending servers to webview:', servers);

            this._view.webview.postMessage({
                type: 'setServers',
                servers: servers
            });

            // Then send tools for each server separately with a delay to ensure processing
            setTimeout(() => {
                for (const server of servers) {
                    // Always send tools update even if empty, to ensure UI is synchronized
                    console.log(`[TOOLS UPDATE] Sending tools update for server ID: ${server.id}, name: ${server.name}`);
                    console.log(`[TOOLS UPDATE] Found ${server.tools ? server.tools.length : 0} tools for server ${server.name}`);
                    console.log(`[TOOLS UPDATE] First tool (if any):`, server.tools && server.tools.length > 0 ? server.tools[0].name : 'none');

                    if (this._view) {
                        this._view.webview.postMessage({
                            type: 'updateServerTools',
                            id: server.id, // Primary identifier
                            name: server.name, // Include name for display purposes
                                    tools: server.tools || [], // Ensure tools is always an array
                                    enabled: server.enabled,
                                    isConnected: server.isConnected,
                                });
                            }
                        }
                    }, 500); // Small delay to ensure the UI has processed the initial server list
        } catch (error) {
            ErrorHandler.handleError('Send Initial State', error);
        }
    }

    /**
     * Handle error events
     * @param serverId The server ID
     * @param error The error
     */
    private _handleError(serverId: string, error?: any): void {
        if (!this._view) {
            return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this._view.webview.postMessage({
            type: 'serverError',
            serverId,
            error: errorMessage
        });
    }

    /**
     * Handle messages from the webview
     * @param message The message from the webview
     */
    private async _handleMessage(message: any): Promise<void> {
        try {
            switch (message.type) {
                case 'getServers':
                    await this._sendInitialState();
                    break;
                    
                case 'getInstancesStatus':
                    // Get the instances status provider through vscode or from the extension
                    this._getInstancesStatusProvider()?.updateStatus();
                    break;
                
                case 'refreshInstances':
                    // Refresh instances status
                    this._getInstancesStatusProvider()?.cleanupStaleInstances();
                    break;
                
                case 'killInstance':
                    // Kill a specific instance
                    if (message.id) {
                        this._getInstancesStatusProvider()?.killInstance(message.id);
                    }
                    break;
                    
                case 'focusInstancesView':
                    // Execut5e the command to focus the instances view
                    try {
                        // This will focus the mcpsxInstancesView
                        vscode.commands.executeCommand('mcpsxInstancesView.focus');
                        console.log('Focusing Server Instances view');
                    } catch (error: unknown) {
                        console.error('Failed to focus instances view:', error);
                        if (this._view) {
                            this._view.webview.postMessage({
                                type: 'error',
                                message: `Failed to focus Server Instances panel: ${error instanceof Error ? error.message : 'Unknown error'}`
                            });
                        }
                    }
                    break;
                
                case 'addServer':
                    if (message.server) {
                        console.log('Adding server: ', message.server);
                        const serverType = message.server.type || ServerType.PROCESS;

                        // const { cmd, args: actualArgs } = findActualExecutable(command, args);
                        const client = await installDynamicToolsExt({
                            context: this.context,
                            serverName: message.server.name,
                            chatParticipantName: `@${message.server.chatParticipantName?.toLowerCase().replace(/\s+/g, '') || message.server.serverName.toLowerCase().replace(/\s+/g, '')}`,
                            command: message.server.command,
                            env: {...(message.server.env ?? {})},
                            transport: serverType === ServerType.PROCESS ? 'stdio' : 'sse',
                            url: serverType === ServerType.SSE ? message.server.url : undefined
                        });
                        
                        // Add to clients array
                        this.clients.push(client);
                        
                        // Get the config and current servers
                        const servers = this._readServersFromFile();
                        
                        // Server ID will be set after the server is added to config
                        let newServerId: string;
                       
                        // const client = await this.clientManager.addServer(transport, message.server.name, message.server.command);
                        // Generate the ID now so we can use it for both the server and the client map
                        newServerId = uuidv4();
                        
                        servers.push({
                            id: newServerId, // Use the generated ID
                            name: message.server.name,
                            command: message.server.command,
                            type: serverType,
                            enabled: true,
                            chatParticipant: {
                                enabled: message.server.chatParticipant?.enabled ?? true,
                                name: message.server.chatParticipant?.name || message.server.name,
                                description: message.server.chatParticipant?.description || `Tools for ${message.server.name}`,
                                isSticky: message.server.chatParticipant?.isSticky || false
                            }
                        });
                        
                        // Update the client map with the new server ID
                        console.log(`Adding client to map: ${newServerId} -> ${message.server.name}`);
                        this.clientMap.set(newServerId, client);
                        this._saveServersToFile(servers);
                        
                        // Immediately notify UI that a server was added
                        if (this._view) {
                            this._view.webview.postMessage({
                                type: 'serverAdded',
                                server: {
                                    name: message.server.name,
                                    enabled: true,
                                    type: serverType
                                }
                            });
                        }
                        
                        // Then send full state update
                        await this._sendInitialState();
                        this._logger?.log(`Has Name? ${client.getServerVersion()?.name}`);
                        this._logger?.log(`Check VSCode Tools: ${JSON.stringify(vscode.lm.tools)}`);
                        if (this._logger) {
                            this._logger.log(`Added ${serverType} server: ${client}`);
                        }
                    }
                    break;
                
                case 'removeServer':
                    if (message.id || message.name) {
                        console.log('Removing server: ', message.id || message.name);
                        // First, try to find the server by ID (preferred)
                        const servers = this._readServersFromFile();
                        
                        // Find the server in the config to get the name for client filtering
                        const serverToRemove = message.id 
                            ? servers.find(s => s.id === message.id)
                            : servers.find(s => s.name === message.name);
                            
                        if (!serverToRemove) {
                            console.warn('Server not found for removal:', message.id || message.name);
                            return;
                        }
                        
                        // Close the client connection
                        // Use the client map to find the client by server ID
                        const client = serverToRemove.id ? this.clientMap.get(serverToRemove.id) : undefined;
                            
                        if(client) {
                            await client.close();
                            
                            // Filter out the client from the clients array
                            this.clients = this.clients.filter(c => c !== client);
                        }
                            
                        // Also remove from the client map
                        if (serverToRemove.id) {
                            console.log(`Removing client mapping for server ID: ${serverToRemove.id}`);
                            this.clientMap.delete(serverToRemove.id);
                        }
                            
                        // Update the configuration without this server (filter by ID if available)
                        if (message.id) {
                            const updatedServers = servers.filter(server => server.id !== message.id);
                            this._saveServersToFile(updatedServers);
                        } else {
                            const updatedServers = servers.filter(server => server.name !== message.name);
                            this._saveServersToFile(updatedServers);
                        }
                        
                        // Immediately notify UI that a server was removed
                        if (this._view) {
                            this._view.webview.postMessage({
                                type: 'serverRemoved',
                                name: message.name
                            });
                        }
                        
                        // Then send full state update
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Removed server: ${message.name}`);
                        }
                    }
                    break;
                
                case 'editServer':
                    if (message.server && (message.server.id || message.server.name)) {
                        console.log('Editing server: ', JSON.stringify(message.server, null, 2));
                        console.log(`[EDIT DEBUG] Starting edit operation for server ID: ${message.server.id}, name: ${message.server.name}`);
                        
                        // Find the server in config by ID (preferred) or name
                        const servers = this._readServersFromFile();
                        
                        console.log('Current servers in config:', JSON.stringify(servers, null, 2));
                        
                        // Find the server to edit
                        const serverIndex = message.server.id
                            ? servers.findIndex(s => s.id === message.server.id)
                            : servers.findIndex(s => s.name === message.server.name);
                        
                        console.log(`Server lookup: id=${message.server.id}, name=${message.server.name}, found index=${serverIndex}`);
                            
                        if (serverIndex < 0) {
                            console.error(`Server not found in config. ID: ${message.server.id}, Name: ${message.server.name}`);
                            console.error('Available servers:', servers.map(s => ({ id: s.id, name: s.name })));
                            throw new Error(`Server not found: ${message.server.id || message.server.name}`);
                        }
                        
                        // We should look up the client by server ID, which is more reliable than name
                        const serverId = servers[serverIndex].id;
                        const serverName = servers[serverIndex].name;
                        
                        console.log(`Looking for client with server ID: ${serverId}, name: ${serverName}`);
                        console.log('Client map contents:', Array.from(this.clientMap.entries()));
                        console.log('Available clients:', this.clients.map(c => ({
                            name: c.getServerVersion()?.name,
                            info: c.getServerVersion()
                        })));
                        
                        // Refresh the client map if it's empty
                        if (this.clientMap.size === 0) {
                            console.log('Client map is empty, initializing it');
                            this._initializeClientMap();
                        }
                        
                        // Try to get the client from the map first
                        let client = serverId ? this.clientMap.get(serverId) : undefined;
                        
                        // If not found but we have a matching client in the clients array, update the map and use that
                        if (!client) {
                            console.log('Client not found in map, trying to find by name...');
                            
                            // Manually scan all clients by name
                            const matchingClients = this.clients.filter(c => 
                                this._normalizeServerName(c.getServerVersion()?.name || '') === 
                                this._normalizeServerName(serverName));
                            
                            if (matchingClients.length > 0) {
                                console.log(`Found ${matchingClients.length} matching clients by name`);
                                client = matchingClients[0];
                                
                                // Update the map for future lookups
                                if (serverId) {
                                    console.log(`Adding missing client mapping: ${serverId} -> ${serverName}`);
                                    this.clientMap.set(serverId, client);
                                }
                            } else {
                                console.log('No matching clients found by name');
                            }
                        }
                            
                        if (!client) {
                            console.error(`Client not found for server ID ${serverId}, name: ${serverName}`);
                            
                            // Let's try to recover by creating a new client directly with more robust error handling
                            try {
                                console.log('[RECOVERY DEBUG] Attempting recovery by creating a new client...');
                                const serverConfig = servers[serverIndex];
                                const recoveryType = serverConfig.type || ServerType.PROCESS;
                                
                                console.log('[RECOVERY DEBUG] Creating recovery client with config:', JSON.stringify({
                                    name: serverConfig.name,
                                    command: serverConfig.command,
                                    type: recoveryType,
                                    env: Object.keys(serverConfig.env || {}).length
                                }));

                                // Unregister any existing tools for this server first
                                console.log(`[RECOVERY DEBUG] Unregistering tools for server: ${serverConfig.name}`);
                                unregisterServerTools(serverConfig.name);

                                // Try to uninstall any existing extension
                                try {
                                    console.log(`[RECOVERY DEBUG] Uninstalling extension for server: ${serverConfig.name}`);
                                    await uninstallToolsExtension(serverConfig.name);
                                } catch (uninstallError) {
                                    console.log(`[RECOVERY DEBUG] Error uninstalling extension (expected): ${uninstallError}`);
                                }
                                
                                // Create a new client instance
                                client = await installDynamicToolsExt({
                                    context: this.context,
                                    serverName: serverConfig.name,
                                    chatParticipantName: serverConfig.chatParticipant?.name || serverConfig.name,
                                    isSticky: serverConfig.chatParticipant?.isSticky,
                                    command: serverConfig.command,
                                    env: {...(serverConfig.env || {})},
                                    transport: recoveryType === ServerType.PROCESS ? 'stdio' : 'sse',
                                    url: recoveryType === ServerType.SSE ? serverConfig.url : undefined,
                                    // Add all server names to help with placeholder replacement
                                    allServerNames: servers.map(s => s.name)
                                });
                                
                                console.log('[RECOVERY DEBUG] Recovery client created successfully');
                                
                                // Add to clients and map
                                this.clients.push(client);
                                this.clientMap.set(serverId, client);

                                // Verify the client is working
                                try {
                                    const isConnected = await client.ping();
                                    console.log(`[RECOVERY DEBUG] Recovery client ping result: ${isConnected}`);
                                } catch (pingError) {
                                    console.log(`[RECOVERY DEBUG] Recovery client ping failed: ${pingError}`);
                                }
                            } catch (recoveryError) {
                                console.error('[RECOVERY DEBUG] Recovery attempt failed:', recoveryError);
                                
                                // Let's try to recover by showing all available clients in a debug message
                                let debugMessage = 'Available clients:\n';
                                this.clients.forEach(c => {
                                    debugMessage += `- ${c.getServerVersion()?.name}\n`;
                                });
                                
                                // Log the debug info
                                console.log(debugMessage);
                                
                                // Instead of erroring, let's return a friendly message
                                if (this._view) {
                                    this._view.webview.postMessage({
                                        type: 'error',
                                        message: `Unable to edit server: Connection not found and recovery failed. 
                                        Please refresh the view or restart the extension.`
                                    });
                                }
                                return;
                            }
                        }

                        try {
                            // Stop the existing server
                            await client.close();
                            console.log(`[RECOVERY DEBUG] Closed existing client for server: ${serverName}`);
                            
                            // Unregister tools for this server before creating a new client
                            console.log(`[RECOVERY DEBUG] Unregistering tools for server: ${serverName}`);
                            unregisterServerTools(serverName);
                            
                            // Remove the old client - use the currently found client instead of searching by name
                            console.log('Removing client with name:', client.getServerVersion()?.name);
                            this.clients = this.clients.filter(c => c !== client);
                            
                            // Remove from client map
                            if (serverId) {
                                console.log(`Removing client from map for edit operation: ${serverId}`);
                                this.clientMap.delete(serverId);
                            }
                            
                            // We already have the server index from earlier - no need to look it up again
                            // Just get the config
                            const servers = this._readServersFromFile();
                            
                            // Check if the server name has changed
                            const oldServerName = servers[serverIndex].name;
                            const newServerName = message.server.name;
                            const nameChanged = oldServerName.toLowerCase() !== newServerName.toLowerCase();

                            if (nameChanged) {
                                console.log(`[NAME CHANGE DEBUG] *** SERVER NAME CHANGED *** from "${oldServerName}" to "${newServerName}"`);

                                    // First unregister tools for the OLD server name
                                    try {
                                        console.log(`[NAME CHANGE DEBUG] Unregistering tools for OLD server name: ${oldServerName}`);
                                        unregisterServerTools(oldServerName);
                                        console.log(`[NAME CHANGE DEBUG] Successfully unregistered tools for OLD server name: ${oldServerName}`);
                                    } catch (unregisterError) {
                                        console.error(`[NAME CHANGE DEBUG] Error unregistering tools for OLD name: ${unregisterError}`);
                                    }

                                    // Also unregister tools for the NEW server name to be safe
                                    try {
                                        console.log(`[NAME CHANGE DEBUG] Unregistering tools for NEW server name: ${newServerName}`);
                                        unregisterServerTools(newServerName);
                                        console.log(`[NAME CHANGE DEBUG] Successfully unregistered tools for NEW server name: ${newServerName}`);
                                    } catch (unregisterError) {
                                        console.error(`[NAME CHANGE DEBUG] Error unregistering tools for NEW name: ${unregisterError}`);
                                    }

                                // Uninstall the extension with the old name
                                try {
                                    const oldExtName = `mcpsx-${oldServerName}-tools-ext`;
                                    console.log(`[NAME CHANGE DEBUG] Uninstalling extension with ID: ${oldExtName}`);
                                    await uninstallToolsExtension(oldServerName);
                                    console.log(`[NAME CHANGE DEBUG] Successfully uninstalled extension: ${oldExtName}`);
                                } catch (uninstallError) {
                                    console.error(`[NAME CHANGE DEBUG] Error uninstalling old extension: ${uninstallError}`);
                                }

                                // Also try to uninstall using the VS Code command directly
                                try {
                                    const oldExtName = `mcpsx-${oldServerName}-tools-ext`;
                                    console.log(`[NAME CHANGE DEBUG] Trying direct VS Code uninstall for: ${oldExtName}`);
                                    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', oldExtName);
                                    console.log(`[NAME CHANGE DEBUG] Direct VS Code uninstall succeeded for: ${oldExtName}`);
                                } catch (directUninstallError) {
                                    console.error(`[NAME CHANGE DEBUG] Direct VS Code uninstall failed: ${directUninstallError}`);
                                }

                                    // Also try to uninstall the new name extension if it exists
                                    try {
                                        const newExtName = `mcpsx-${newServerName}-tools-ext`;
                                        console.log(`[NAME CHANGE DEBUG] Trying direct VS Code uninstall for new name: ${newExtName}`);
                                        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', newExtName);
                                        console.log(`[NAME CHANGE DEBUG] Direct VS Code uninstall succeeded for new name: ${newExtName}`);
                                    } catch (directUninstallError) {
                                        console.error(`[NAME CHANGE DEBUG] Direct VS Code uninstall for new name failed (expected): ${directUninstallError}`);
                                    }
                            }

                            // Use the server index we already found
                            console.log('Using previously found server index:', serverIndex);
                            
                            // Validate it's still valid
                            if (serverIndex >= servers.length) {
                                console.error('Server index out of bounds:', serverIndex, 'max:', servers.length);
                                return;
                            }
                            
                            if (serverIndex >= 0) {
                                // Preserve the server ID
                                const existingId = servers[serverIndex].id;
                                
                                console.log(`[EDIT DEBUG] Updating server config for ID: ${existingId}, name: ${servers[serverIndex].name} -> ${message.server.name}`);
                                // Store the original server configuration for recovery if needed
                                const originalConfig = { ...servers[serverIndex] };

                                // Update the server configuration, preserving ID
                                servers[serverIndex] = {
                                    ...servers[serverIndex],
                                    id: existingId, // Preserve existing ID
                                    name: message.server.name,
                                    command: message.server.command,
                                    type: message.server.type,
                                    env: message.server.env,
                                    url: message.server.url,
                                    authToken: message.server.authToken,
                                    // Preserve enabled state from message or the existing config
                                    enabled: message.server.enabled !== undefined
                                        ? message.server.enabled
                                        : servers[serverIndex].enabled,
                                    // Update chat participant configuration
                                    chatParticipant: {
                                        enabled: message.server.chatParticipant?.enabled ??
                                            (servers[serverIndex].chatParticipant?.enabled ?? true),
                                        name: message.server.chatParticipant?.name ||
                                            servers[serverIndex].chatParticipant?.name || message.server.name,
                                        description: message.server.chatParticipant?.description ||
                                            servers[serverIndex].chatParticipant?.description || `Tools for ${message.server.name}`,
                                        isSticky: message.server.chatParticipant?.isSticky ??
                                            (servers[serverIndex].chatParticipant?.isSticky ?? false)
                                    }
                                };
                                
                                // Save the updated configuration
                                console.log(`[EDIT DEBUG] About to save updated server configuration`);
                                try {
                                    this._saveServersToFile(servers);
                                    console.log(`[EDIT DEBUG] Successfully saved server configuration`);
                                } catch (saveError) {
                                    console.error(`[EDIT DEBUG] Error saving server configuration: ${saveError}`);
                                    if (this._view) {
                                        this._view.webview.postMessage({
                                            type: 'error',
                                            message: `Failed to save server configuration: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
                                        });
                                    }
                                    // Don't proceed with client creation if save failed
                                    return;
                                }
                                
                                // Immediately notify UI about the server update
                                if (this._view) {
                                    this._view.webview.postMessage({
                                        type: 'serverUpdated',
                                        server: message.server
                                    });
                                }
                                
                                // Create a new client with the updated configuration
                                const serverType = message.server.type || ServerType.PROCESS;
                                console.log(`[EDIT DEBUG] Creating new client with name: ${message.server.name}, type: ${serverType}`);
                                
                                // Log the current state of the config file to verify it was updated
                                try {
                                    if (fs.existsSync(this.configPath)) {
                                        const currentConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                                        console.log(`[EDIT DEBUG] Current config file contents: ${JSON.stringify(currentConfig, null, 2)}`);
                                        
                                        // Check if our server update is in the file
                                        const updatedServer = currentConfig.servers?.find((s: any) => s.id === existingId);
                                        console.log(`[EDIT DEBUG] Updated server in config file: ${JSON.stringify(updatedServer, null, 2)}`);
                                    } else {
                                        console.log(`[EDIT DEBUG] Config file does not exist at ${this.configPath}`);
                                    }
                                } catch (configReadError) {
                                    console.error(`[EDIT DEBUG] Error reading config file: ${configReadError}`);
                                }
                                
                                try {
                                    console.log(`[EDIT DEBUG] Calling installDynamicToolsExt for ${message.server.name}`);
                                    const newClient = await installDynamicToolsExt({
                                        context: this.context,
                                        serverName: message.server.name || originalConfig.name,
                                        chatParticipantName: message.server.chatParticipant?.name || originalConfig.chatParticipant?.name,
                                        isSticky: message.server.chatParticipant?.isSticky ?? originalConfig.chatParticipant?.isSticky,
                                        command: message.server.command || originalConfig.command,
                                        env: { ...(message.server.env ?? originalConfig.env ?? {}) },
                                        transport: serverType === ServerType.PROCESS ? 'stdio' : 'sse',
                                        url: serverType === ServerType.SSE ? (message.server.url || originalConfig.url) : undefined,
                                        // Add all server names to help with placeholder replacement
                                        allServerNames: servers.map(s => s.name)
                                    });
                                    
                                    console.log(`[EDIT DEBUG] New client created:`, 
                                        newClient.getServerVersion()?.name,
                                        'Version:', newClient.getServerVersion());
                                    console.log(`[EDIT DEBUG] Client transport type: ${newClient.transport?.constructor.name}`);
                                    
                                    // Add the new client to the array
                                    this.clients.push(newClient);
                                    
                                    // Update the client map with the new client
                                    if (existingId) {
                                        console.log(`[EDIT DEBUG] Updating client map: ${existingId} -> ${message.server.name}`);
                                        
                                        // First, remove any existing client with this ID to avoid duplicates
                                        const oldClient = this.clientMap.get(existingId);
                                        if (oldClient) {
                                            console.log(`[EDIT DEBUG] Found existing client for ID ${existingId}, removing it first`);
                                            this.clientMap.delete(existingId);
                                        }
                                        
                                        // Now set the new client
                                        this.clientMap.set(existingId, newClient);
                                        
                                        // Verify the client map was updated correctly
                                        const mappedClient = this.clientMap.get(existingId);
                                        console.log(`[EDIT DEBUG] Verified client map update: ${!!mappedClient}, client name: ${mappedClient?.getServerVersion()?.name}`);
                                    }

                                    // Explicitly fetch tools to make sure they're immediately available
                                    try {
                                        const toolsResponse = await newClient.listTools();
                                        if (toolsResponse.tools && toolsResponse.tools.length > 0) {
                                            console.log(`Found ${toolsResponse.tools.length} tools for ${message.server.name}`);

                                            // Send tools update to UI
                                            if (this._view) {
                                                this._view.webview.postMessage({
                                                    type: 'updateServerTools',
                                                    id: existingId,
                                                    name: message.server.name,
                                                    tools: toolsResponse.tools,
                                                    isConnected: true,
                                                    enabled: true
                                                });
                                            }
                                        }
                                    } catch (toolsError) {
                                        console.warn(`Error fetching tools for ${message.server.name}:`, toolsError);
                                    }
                                } catch (error) {
                                    console.error('Failed to create new client:', error);
                                    console.error(`[EDIT DEBUG] Failed to create new client: ${error instanceof Error ? error.stack : 'Unknown error'}`);
                                    
                                    // Check if the config file was updated despite the client creation failure
                                    try {
                                        if (fs.existsSync(this.configPath)) {
                                            const currentConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                                            console.log(`[EDIT DEBUG] Config file after client creation failure: ${JSON.stringify(currentConfig, null, 2)}`);
                                            
                                            // Check if our server update is in the file
                                            const updatedServer = currentConfig.servers?.find((s: any) => s.id === existingId);
                                            console.log(`[EDIT DEBUG] Server in config after failure: ${JSON.stringify(updatedServer, null, 2)}`);
                                            
                                            if (updatedServer && updatedServer.name === message.server.name) {
                                                console.log(`[EDIT DEBUG] Config file was updated with new name, but client creation failed`);
                                            }
                                        }
                                    } catch (configReadError) {
                                        console.error(`[EDIT DEBUG] Error reading config after failure: ${configReadError}`);
                                    }
                                    
                                    // Report error to UI
                                    if (this._view) {
                                        this._view.webview.postMessage({
                                            type: 'error',
                                            message: `Failed to create new connection: ${error instanceof Error ? error.message : 'Unknown error'}`
                                        });
                                    }
                                    return;
                                }
                                
                                // Update the UI with full state
                                console.log(`[EDIT DEBUG] Sending full state update to UI`);
                                await this._sendInitialState();
                                
                                if (this._logger) {
                                    this._logger.log(`Updated and restarted server: ${message.server.name}`);
                                }
                            }
                        } catch (error) {
                            console.error(`[EDIT DEBUG] Error in editServer: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            if (error instanceof Error && error.stack) {
                                console.error(`[EDIT DEBUG] Error stack: ${error.stack}`);
                            }
                            ErrorHandler.handleError('Edit Server', error);
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'error',
                                    message: error instanceof Error ? error.message : 'Failed to update server'
                                });
                            }
                        }
                    }
                    break;
                
                case 'toggleServer':
                    if (message.id !== undefined || message.name !== undefined) {
                        // Get config to find server by ID or name
                        console.log(`[TOGGLE DEBUG] Received toggle request for server ID: ${message.id}, name: ${message.name}, enabled: ${message.enabled}`);
                        const servers = this._readServersFromFile();
                        
                        // Find server by ID (preferred) or name
                        const serverConfig = message.id 
                            ? servers.find(s => s.id === message.id)
                            : servers.find(s => s.name === message.name);
                            
                        if (!serverConfig) {
                            console.warn(`Server not found for toggle: ${message.id || message.name}`);
                            // Notify UI that toggle failed
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverToggling',
                                    id: message.id,
                                    name: message.name,
                                    toggling: false
                                });
                            }
                            return;
                        }
                        
                        // Find client by name (clients are identified by name)
                        // Use the client map to find the client by server ID
                        const client = serverConfig.id ? this.clientMap.get(serverConfig.id) : undefined;
                            
                        console.log(`[TOGGLE DEBUG] Found server config: ${serverConfig.name}, ID: ${serverConfig.id}, enabled: ${serverConfig.enabled}`);
                        console.log(`[TOGGLE DEBUG] Client found: ${!!client}`);
                            
                        if (!client) {
                            console.warn(`Client not found for server: ${serverConfig.name}`);
                            // Notify UI that toggle failed
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverToggling',
                                    id: serverConfig.id,
                                    name: serverConfig.name,
                                    toggling: false
                                });
                            }
                            return;
                        }
                        
                        try {
                            // Immediately notify UI that toggle is in progress
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverToggling',
                                    id: serverConfig.id,
                                    name: serverConfig.name,
                                    toggling: true
                                });
                            }
                            
                            const isRunning = await client.ping();
                            console.log(`[TOGGLE DEBUG] Server ${serverConfig.name} ping result: ${isRunning}, requested state: ${message.enabled ? 'enabled' : 'disabled'}`);
                            
                            // Check if we need to change the state
                            if (message.enabled && !isRunning) {
                                // Enable the server
                                console.log(`[TOGGLE DEBUG] Starting server: ${serverConfig.name}`);
                                try {
                                    // First ensure the client is properly closed before restarting
                                    try {
                                        // Store reference to the original client
                                        const originalClient = client;
                                        
                                        await client.close();
                                        console.log(`[TOGGLE DEBUG] Closed existing client for ${serverConfig.name} before restart`);
                                    } catch (closeError) {
                                        console.log(`[TOGGLE DEBUG] Error closing client (expected): ${closeError}`);
                                        // Ignore errors here, as the client might already be closed
                                    }
                                    
                                    // Recreate the client to ensure a clean start
                                    console.log(`[TOGGLE DEBUG] Recreating client for ${serverConfig.name}`);
                                    const serverType = serverConfig.type || ServerType.PROCESS;
                                    const newClient = await installDynamicToolsExt({
                                        context: this.context,
                                        serverName: serverConfig.name,
                                        chatParticipantName: serverConfig.chatParticipant?.name,
                                        isSticky: serverConfig.chatParticipant?.isSticky,
                                        command: serverConfig.command,
                                        env: {...(serverConfig.env || {})},
                                        transport: serverType === ServerType.PROCESS ? 'stdio' : 'sse',
                                        url: serverType === ServerType.SSE ? serverConfig.url : undefined
                                    });
                                    
                                    // Replace the old client with the new one
                                    this.clients = this.clients.filter(c => c !== client);
                                    this.clients.push(newClient);
                                    this.clientMap.set(serverConfig.id, newClient);
                                    
                                    await newClient.transport?.start();
                                    console.log(`[TOGGLE DEBUG] Started transport for ${serverConfig.name}`);
                                    
                                    // Update the configuration to mark the server as enabled
                                    const updatedServers = servers.map(s => 
                                        s.id === serverConfig.id ? { ...s, enabled: true } : s
                                    );
                                    this._saveServersToFile(updatedServers);
                                    console.log(`[TOGGLE DEBUG] Updated configuration for ${serverConfig.name} to enabled=true`);
                                    
                                    // Verify connection after starting
                                    try {
                                        // Wait a moment for the server to initialize
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        
                                        const connected = await newClient.ping();
                                        console.log(`[TOGGLE DEBUG] Server ${serverConfig.name} started, connected: ${connected}`);
                                        
                                        // If connected, try to fetch tools
                                        if (connected) {
                                            try {
                                                const toolsResponse = await newClient.listTools();
                                                console.log(`[TOGGLE DEBUG] Server ${serverConfig.name} tools: ${toolsResponse.tools?.length || 0}`);
                                                
                                                // Send tools update to UI
                                                if (this._view && toolsResponse.tools) {
                                                    this._view.webview.postMessage({
                                                        type: 'updateServerTools',
                                                        id: serverConfig.id,
                                                        name: serverConfig.name,
                                                        tools: toolsResponse.tools,
                                                        isConnected: true,
                                                        enabled: true
                                                    });
                                                }
                                            } catch (toolsError) {
                                                console.error(`[TOGGLE DEBUG] Error fetching tools: ${toolsError}`);
                                            }
                                        }
                                        
                                        // Notify UI that server was started
                                        if (this._view) {
                                            this._view.webview.postMessage({
                                                type: 'serverToggled',
                                                id: serverConfig.id,
                                                name: serverConfig.name,
                                                enabled: true,
                                                isConnected: connected
                                            });
                                        }
                                    } catch (pingError) {
                                        console.error(`[TOGGLE DEBUG] Failed to verify connection after starting: ${pingError}`);
                                        // Still notify UI that server was toggled, but with isConnected=false
                                        if (this._view) {
                                            this._view.webview.postMessage({
                                                type: 'serverToggled',
                                                id: serverConfig.id,
                                                name: serverConfig.name,
                                                enabled: true,
                                                isConnected: false
                                            });
                                        }
                                    }
                                } catch (startError) {
                                    console.error(`[TOGGLE DEBUG] Error starting server: ${startError}`);
                                    // Notify UI that toggle failed
                                    if (this._view) {
                                        this._view.webview.postMessage({
                                            type: 'error',
                                            serverId: serverConfig.id,
                                            message: `Failed to start server: ${startError instanceof Error ? startError.message : 'Unknown error'}`
                                        });
                                        this._view.webview.postMessage({
                                            type: 'serverToggling',
                                            id: serverConfig.id,
                                            name: serverConfig.name,
                                            toggling: false
                                        });
                                    }
                                }
                            } else if (!message.enabled && isRunning) {
                                // Disable the server
                                console.log(`[TOGGLE DEBUG] Stopping server: ${serverConfig.name}`);
                                try {
                                    await client.close();
                                    console.log(`[DEBUG] Closed client for server: ${serverConfig.name}`);
                                    
                                    // Unregister tools for this server when toggling off
                                    console.log(`[DEBUG] Unregistering tools for server: ${serverConfig.name}`);
                                    unregisterServerTools(serverConfig.name);
                                    
                                    // Update the configuration to mark the server as disabled
                                    const updatedServers = servers.map(s => 
                                        s.id === serverConfig.id ? { ...s, enabled: false } : s
                                    );
                                    this._saveServersToFile(updatedServers);
                                    
                                    // Notify UI that server was stopped
                                    if (this._view) {
                                        this._view.webview.postMessage({
                                            type: 'serverToggled',
                                            id: serverConfig.id,
                                            name: serverConfig.name,
                                            enabled: false,
                                            isConnected: false
                                        });
                                    }
                                } catch (stopError) {
                                    console.error(`[TOGGLE DEBUG] Error stopping server: ${stopError}`);
                                    // Notify UI that toggle failed
                                    if (this._view) {
                                        this._view.webview.postMessage({
                                            type: 'error',
                                            serverId: serverConfig.id,
                                            message: `Failed to stop server: ${stopError instanceof Error ? stopError.message : 'Unknown error'}`
                                        });
                                        this._view.webview.postMessage({
                                            type: 'serverToggling',
                                            id: serverConfig.id,
                                            name: serverConfig.name,
                                            toggling: false
                                        });
                                    }
                                }
                            } else {
                                // Server is already in the requested state
                                console.log(`[TOGGLE DEBUG] Server ${serverConfig.name} is already in the requested state (${message.enabled ? 'enabled' : 'disabled'})`);
                                // Just update the UI to reflect the current state
                                if (this._view) {
                                    this._view.webview.postMessage({
                                        type: 'serverToggled',
                                        id: serverConfig.id,
                                        name: serverConfig.name,
                                        enabled: message.enabled,
                                        isConnected: isRunning
                                    });
                                }
                            }
                            
                            // Update UI with full state update
                            await this._sendInitialState();
                        } catch (error) {
                            // Handle error and notify UI
                            console.error('Error toggling server:', error);
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'error',
                                    serverId: serverConfig.id,
                                    message: `Failed to toggle server: ${error instanceof Error ? error.message : 'Unknown error'}`
                                });
                                
                                // Also notify that toggling is complete to reset UI state
                                this._view.webview.postMessage({
                                    type: 'serverToggling',
                                    id: serverConfig.id,
                                    name: serverConfig.name,
                                    toggling: false
                                });
                            }
                        }
                    }
                    break;
            }
        } catch (error) {
            ErrorHandler.handleError('Handle Webview Message', error);
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'error',
                    serverId: message.id || message.name,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }

    /**
     * Generate the HTML for the webview
     * @param webview The webview
     * @returns The HTML content
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Create URIs for the scripts and styles
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:;">
                <title></title>                
            </head>
            <body>
                <div id="root"></div>
                <script>
                    // Debug logging
                    console.log('Debug: Starting script execution');
                    window.addEventListener('error', function(event) {
                        console.error('Script error:', event.error);
                    });
                    
                    // Create the vscode API for messaging
                    const vscode = acquireVsCodeApi();
                    window.vscodeApi = vscode;
                </script>
                <script src="${scriptUri}" async defer></script>
               <!-- Removed commented out script that was showing in UI -->
            </body>
            </html>`;
    }

    /**
     * Show the webview panel
     */
    public async show(): Promise<void> {
        if (this._view) {
            this._view.show?.(true);
        }
    }

    /**
     * Reveal the webview in the primary column
     */
    public static async createOrShow(
        context: vscode.ExtensionContext,
        clients: Client[]
    ): Promise<ServerViewProvider> {
        const provider = new ServerViewProvider(context, clients);
        
        // Register the webview provider
        const provider_registration = vscode.window.registerWebviewViewProvider(
            ServerViewProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        
        context.subscriptions.push(provider_registration);
        
        return provider;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        // Nothing to dispose, as the webview is managed by VS Code
    }
}
