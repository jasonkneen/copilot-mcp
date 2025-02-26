import * as vscode from 'vscode';
import { ServerManager } from '../server/ServerManager';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { MCPClientWrapper } from '../mcp/MCPClientWrapper';
import { Tool, Resource } from '@modelcontextprotocol/sdk/types';
import { EventBus } from '../utils/EventBus';
import { ServerConfig, ServerEventType } from '../server/ServerConfig';

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
        const subscription = EventBus.onEvent(event => {
            switch (event.type) {
                case ServerEventType.SERVER_STARTED:
                    this._updateServerState(event.serverId, { running: true });
                    break;
                case ServerEventType.SERVER_STOPPED:
                    this._updateServerState(event.serverId, { running: false, tools: [] });
                    break;
                case ServerEventType.TOOLS_CHANGED:
                    if (event.data?.tools) {
                        this._updateServerState(event.serverId, { tools: event.data.tools });
                    }
                    break;
                case ServerEventType.RESOURCES_CHANGED:
                    if (event.data?.resources) {
                        this._updateServerState(event.serverId, { resources: event.data.resources });
                    }
                    break;
                // Handle other event types
                default:
                    // Handle error events passed via the event bus
                    if (event.data?.error) {
                        this._handleError(event.serverId, event.data.error);
                    }
                    break;
            }
        });

        this.context.subscriptions.push(subscription);
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
                const isRunning = this.serverManager.isServerRunning(server.id);
                const serverProcess = isRunning ? this.serverManager.getServerProcess(server.id) : undefined;
                
                return {
                    ...server,
                    running: isRunning,
                    tools: serverProcess?.tools || [],
                    resources: serverProcess?.resources || []
                };
            });

            this._view.webview.postMessage({ 
                type: 'setServers', 
                servers: serversWithState 
            });
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
            this._view.webview.postMessage({
                type: 'updateServerState',
                serverId,
                state
            });
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
                        const newServer: Omit<ServerConfig, 'id'> = {
                            name: message.server.name,
                            command: message.server.command,
                            enabled: message.server.enabled ?? true,
                            env: message.server.env || {}
                        };
                        
                        await this.serverManager.addServer(newServer);
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Added server: ${newServer.name}`);
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
                        await this.serverManager.updateServer(message.server.id, {
                            name: message.server.name,
                            command: message.server.command,
                            env: message.server.env
                        });
                        await this._sendInitialState();
                        
                        if (this._logger) {
                            this._logger.log(`Updated server: ${message.server.id}`);
                        }
                    }
                    break;
                
                case 'toggleServer':
                    if (message.id !== undefined) {
                        const isRunning = this.serverManager.isServerRunning(message.id);
                        const server = this.serverManager.getServer(message.id);
                        
                        if (message.enabled && !isRunning && server) {
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