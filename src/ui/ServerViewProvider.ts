import * as vscode from 'vscode';
import { ServerManager } from '../server/ServerManager';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { MCPClientWrapper } from '../mcp/MCPClientWrapper';
import { Tool, Resource } from '@modelcontextprotocol/sdk/types';
import { EventBus } from '../utils/EventBus';
import { ServerConfig, ServerEventType, ServerType, ServerProcess } from '../server/ServerConfig';

/**
 * WebviewProvider for the MCP Server Manager UI
 */
export class ServerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mcpServerManager';
    private _view?: vscode.WebviewView;
    private _logger?: Logger;

    /**
     * Creates a new server view provider
     * @param context The extension context
     * @param serverManager The server manager instance
     */
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly serverManager: ServerManager
    ) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }

        // Listen for server events and update the UI accordingly
        this._setupEventListeners();
    }

    /**
     * Set up event listeners to update the UI based on server events
     */
    private _setupEventListeners(): void {
        // Listen for server events to update UI
        const eventBus = EventBus.getInstance();
        
        // Set up listeners for each event type
        const startedSubscription = eventBus.on(ServerEventType.SERVER_STARTED, (event: any) => {
            this._updateServerState(event.serverId, { running: true });
        });
        
        const stoppedSubscription = eventBus.on(ServerEventType.SERVER_STOPPED, (event: any) => {
            this._updateServerState(event.serverId, { running: false, tools: [] });
        });
        
        const toolsChangedSubscription = eventBus.on(ServerEventType.TOOLS_CHANGED, (event: any) => {
            if (event.data?.tools) {
                this._updateServerState(event.serverId, { tools: event.data.tools });
            }
        });
        
        const resourcesChangedSubscription = eventBus.on(ServerEventType.RESOURCES_CHANGED, (event: any) => {
            if (event.data?.resources) {
                this._updateServerState(event.serverId, { resources: event.data.resources });
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
            const servers = this.serverManager.getServers();
            const serversWithState = servers.map((server: ServerConfig) => {
                // Get running servers from the server manager
                const processesMap = this.serverManager['_processes'] as Map<string, ServerProcess>;
                const isRunning = processesMap.has(server.id);
                const serverProcess = isRunning ? processesMap.get(server.id) : undefined;
                
                // Ensure tools and resources are properly included
                const tools = serverProcess?.tools || [];
                const resources = serverProcess?.resources || [];
                
                return {
                    ...server,
                    running: isRunning,
                    tools,
                    resources
                };
            });

            this._view.webview.postMessage({ 
                type: 'setServers', 
                servers: serversWithState 
            });
            
            // Send tools for each server separately after initial state
            // This ensures proper tool registration in the UI
            for (const server of serversWithState) {
                if (server.tools && server.tools.length > 0) {
                    this._view.webview.postMessage({
                        type: 'updateServerTools',
                        serverId: server.id,
                        tools: server.tools
                    });
                }
            }
        } catch (error) {
            ErrorHandler.handleError('Send Initial State', error);
        }
    }

    /**
     * Update the state of a server in the UI
     * @param serverId The server ID
     * @param state The updated state properties
     */
    private _updateServerState(serverId: string, state: Partial<{
        running: boolean;
        tools: Tool[];
        resources: Resource[];
    }>): void {
        if (!this._view) {
            return;
        }

        try {
            const server = this.serverManager.getServer(serverId);
            if (!server) {
                return;
            }
            
            // Get the full server data with running state
            const processesMap = this.serverManager['_processes'] as Map<string, ServerProcess>;
            const isRunning = processesMap.has(serverId);
            const serverProcess = isRunning ? processesMap.get(serverId) : undefined;
            
            // Collect tools and resources from the server process if running
            const tools = state.tools || serverProcess?.tools || [];
            const resources = state.resources || serverProcess?.resources || [];
            
            // Send the complete updated server state
            this._view.webview.postMessage({
                type: 'updateServer',
                server: {
                    ...server,
                    running: state.running !== undefined ? state.running : isRunning,
                    tools: tools,
                    resources: resources
                }
            });
            
            // Also send tools update as a separate message to ensure UI registers them correctly
            if (tools.length > 0) {
                this._view.webview.postMessage({
                    type: 'updateServerTools',
                    serverId,
                    tools
                });
            }
        } catch (error) {
            ErrorHandler.handleError('Update Server State', error);
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
                
                case 'addServer':
                    if (message.server) {
                        // Create base server config with required fields
                        const newServer: Omit<ServerConfig, 'id'> & { id?: string } = {
                            id: crypto.randomUUID(), // Add ID for the new server
                            name: message.server.name,
                            type: message.server.type || ServerType.PROCESS,
                            command: '', // Default empty command
                            enabled: message.server.enabled ?? true,
                            env: undefined // Initialize as undefined
                        };
                        
                        // Only include env if it has values
                        if (message.server.env && Object.keys(message.server.env).length > 0) {
                            newServer.env = message.server.env;
                            console.log('Processing environment variables for new server:', newServer.env);
                        }
                        
                        // Add appropriate fields based on server type
                        const serverType = newServer.type || ServerType.PROCESS;
                        
                        if (serverType === ServerType.PROCESS) {
                            newServer.command = message.server.command;
                        } else if (serverType === ServerType.SSE) {
                            newServer.url = message.server.url;
                            newServer.authToken = message.server.authToken;
                        }
                        
                        // Create a server config object without the temporary id property
                        const { id, ...serverWithoutId } = newServer;
                        const serverConfig: ServerConfig = {
                            id: id!, // Use the generated ID
                            ...serverWithoutId
                        };
                        
                        await this.serverManager.addServer(serverConfig);
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Added ${serverType} server: ${newServer.name}`);
                        }
                    }
                    break;
                
                case 'removeServer':
                    if (message.id) {
                        await this.serverManager.removeServer(message.id);
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Removed server: ${message.id}`);
                        }
                    }
                    break;
                
                case 'editServer':
                    if (message.server && message.server.id) {
                        const server = this.serverManager.getServer(message.server.id);
                        const updates: Partial<ServerConfig> = {
                            name: message.server.name,
                            // Ensure type is always set - default to the existing type or PROCESS
                            type: message.server.type || (server?.type || ServerType.PROCESS)
                        };
                        
                        // Add appropriate fields based on server type
                        const serverType = updates.type || ServerType.PROCESS;
                        
                        if (serverType === ServerType.PROCESS) {
                            updates.command = message.server.command;
                            
                            // Handle environment variables carefully
                            if (message.server.env && Object.keys(message.server.env).length > 0) {
                                updates.env = message.server.env;
                                console.log('Editing server with environment variables:', updates.env);
                            } else {
                                // Explicitly set to undefined if no env vars to avoid empty object issues
                                updates.env = undefined;
                            }
                        } else if (serverType === ServerType.SSE) {
                            updates.url = message.server.url;
                            updates.authToken = message.server.authToken;
                        }
                        
                        // Create a complete server config by combining the existing server with updates
                        const updatedServer: ServerConfig = {
                            ...server!,
                            ...updates
                        };
                        await this.serverManager.updateServer(updatedServer);
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Updated server: ${message.server.id}`);
                        }
                    }
                    break;
                
                case 'toggleServer':
                    if (message.id !== undefined) {
                        // Get running servers from the server manager
                        const processesMap = this.serverManager['_processes'] as Map<string, ServerProcess>;
                        const isRunning = processesMap.has(message.id);
                        const server = this.serverManager.getServer(message.id);
                        
                        if (server) {
                            // Update the server's enabled status in the configuration
                            server.enabled = message.enabled;
                            await this.serverManager.updateServer(server);
                            
                            if (message.enabled && !isRunning) {
                                // Start the server
                                await this.serverManager.startServer(server);
                                if (this._logger) {
                                    this._logger.log(`Started server: ${message.id}`);
                                }
                            } else if (!message.enabled && isRunning) {
                                // Stop the server
                                await this.serverManager.stopServer(message.id);
                                if (this._logger) {
                                    this._logger.log(`Stopped server: ${message.id}`);
                                }
                            }
                            
                            // Update UI immediately with server status and tools
                            await this._sendInitialState();
                        }
                    }
                    break;
            }
        } catch (error) {
            ErrorHandler.handleError('Handle Webview Message', error);
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'error',
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
                <title>MCP Server Manager</title>
                <style>
                    body {
                        padding: 0;
                        margin: 0;
                        width: 100%;
                        height: 100%;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-panel-background);
                        font-family: var(--vscode-font-family);
                    }
                    .mcp-server-manager {
                        padding: 0 16px;
                    }
                    .server-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px;
                        margin: 8px 0;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 4px;
                    }
                    .server-info {
                        display: flex;
                        flex-direction: column;
                    }
                    .server-name {
                        font-weight: bold;
                    }
                    .server-command {
                        font-size: 0.9em;
                        color: var(--vscode-descriptionForeground);
                    }
                    .server-controls {
                        display: flex;
                        gap: 8px;
                        align-items: center;
                    }
                    .empty-state {
                        text-align: center;
                        padding: 16px;
                        color: var(--vscode-descriptionForeground);
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 8px;
                        cursor: pointer;
                        border-radius: 2px;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .remove-button {
                        background: var(--vscode-errorForeground);
                    }
                </style>
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
                <script>
                    // More debug logging
                    console.log('Debug: After script tag');
                    window.addEventListener('load', () => {
                        console.log('Debug: Window loaded');
                        console.log('Debug: React available:', typeof React !== 'undefined');
                        console.log('Debug: Root element:', document.getElementById('root'));
                        
                        // Request initial server list
                        window.vscodeApi.postMessage({ type: 'getServers' });
                    });
                </script>
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
        serverManager: ServerManager
    ): Promise<ServerViewProvider> {
        const provider = new ServerViewProvider(context, serverManager);
        
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