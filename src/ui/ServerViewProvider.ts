import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { Tool, Resource } from '@modelcontextprotocol/sdk/types';
import { EventBus } from '../utils/EventBus';
import { ServerEventType, ServerType } from '../server/ServerConfig';
import { MCPClientManager, Transport } from '@automatalabs/mcp-client-manager';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
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
     * @param clientManager The client manager instance
     */
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly clientManager: MCPClientManager
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
            const serverNames = this.clientManager.listServerNames();
            
            const servers = await serverNames.reduce(async (accPromise, server: string) => {
                // Wait for previous promise to resolve
                const acc = await accPromise;
                
                // get the info
                const client = this.clientManager.getClientIdByServerName(server);
                if (!client) {return acc;}
                
                const clientWrapper = this.clientManager.getClientInfo(client);
                if (!clientWrapper) {return acc;}
                
                // Get running servers from the server manager
                const isRunning = this.clientManager.isClientHealthy(client);
                
                // Ensure tools and resources are properly included
                const tools = await this.clientManager.getClientTools(client) || [];
                const resources = await this.clientManager.getClientResources(client) || [];
                
                // Add valid server to accumulator
                acc.push({
                    id: client, // Add id field for referencing in updateServerTools
                    name: server,
                    running: isRunning,
                    tools,
                    resources
                });
                
                return acc;
            }, Promise.resolve([] as Array<{
                id: string;
                name: string;
                running: boolean;
                tools: Tool[];
                resources: Resource[];
            }>));

            this._view.webview.postMessage({ 
                type: 'setServers', 
                servers: servers 
            });
            
            // Send tools for each server separately after initial state
            // This ensures proper tool registration in the UI
            for (const server of servers) {
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
    private async _updateServerState(serverId: string, state: Partial<{
        running: boolean;
        tools: Tool[];
        resources: Resource[];
    }>): Promise<void> {
        if (!this._view) {
            return;
        }

        try {
            const serverClient = this.clientManager.getClientInfo(serverId);
            if (!serverClient) {
                return;
            }
            
            // Get the full server data with running state
            const isRunning = this.clientManager.isClientHealthy(serverId);
            
            // Collect tools and resources from the server process if running
            const tools = await this.clientManager.getClientTools(serverId) || [];
            const resources = await this.clientManager.getClientResources(serverId) || [];
            
            // Send the complete updated server state
            this._view.webview.postMessage({
                type: 'updateServer',
                server: {
                    ...serverClient,
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
                        const serverType = message.server.type || ServerType.PROCESS;
                        let transport: Transport;
                        if (serverType === ServerType.PROCESS) {
                            transport = new StdioClientTransport({
                                command: message.server.command,
                                env: message.server.env
                            });
                        } else if(serverType === ServerType.SSE) {
                            transport = new SSEClientTransport(message.server.url);
                            
                        } else {
                            throw new Error(`Unsupported server type: ${serverType}`);
                        }
                        
                        const client = await this.clientManager.addServer(transport, message.server.name, {
                            authToken: message.server.authToken,
                            env: message.server.env
                        });
                        
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Added ${serverType} server: ${client}`);
                        }
                    }
                    break;
                
                case 'removeServer':
                    if (message.id) {
                        this.clientManager.removeClient(message.id);
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Removed server: ${message.id}`);
                        }
                    }
                    break;
                
                case 'editServer':
                    if (message.server && message.server.id) {
                        throw new Error('Edit server not supported');
                    }
                    break;
                
                case 'toggleServer':
                    if (message.id !== undefined) {
                        // Get running servers from the server manager
                        const client = this.clientManager.getClientInfo(message.id);
                        if (!client) {
                            return;
                        }
                        const isRunning = this.clientManager.isClientHealthy(message.id);
                        if (!isRunning) {
                            // toggle the server on
                            await this.clientManager.reconnectClient(message.id);
                            if (this._logger) {
                                this._logger.log(`Started server: ${message.id}`);
                            }
                        } else {
                            // toggle the server off
                            await this.clientManager.disconnectClient(message.id);
                            if (this._logger) {
                                this._logger.log(`Stopped server: ${message.id}`);
                            }
                        }
                        
                            
                            // Update UI immediately with server status and tools
                        await this._sendInitialState();
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
        clientManager: MCPClientManager
    ): Promise<ServerViewProvider> {
        const provider = new ServerViewProvider(context, clientManager);
        
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