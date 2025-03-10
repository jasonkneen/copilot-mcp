import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';
import { Tool, Resource } from '@modelcontextprotocol/sdk/types';
import { EventBus } from '@/utils/EventBus';
import { ServerConfig, ServerEventType, ServerType } from '@/server/ServerConfig';
import { createToolsExtension, installDynamicToolsExt, NamedClient, unregisterServerTools } from '@/tools';
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
        private clients: NamedClient[]
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
            const servers = [];
            for (const client of this.clients) {
                let isConnected = false;
                try {
                    const value = await client.ping();
                    console.log('MCP Server Ping: ', value);
                    isConnected = true;
                } catch (e) {
                    // console.warn(e);
                    console.debug('MCP not connected', e);
                    isConnected = false;
                }
                let tools: Tool[] = [];
                try {
                    const toolsResponse = await client.listTools();
                    tools = [...toolsResponse.tools];
                } catch (e) {
                    console.warn(e);
                    console.debug('Server tools not available', e);
                }

                let resources: Resource[] = [];
                try {
                    const resourcesResponse = await client.listResources();
                    resources = [...resourcesResponse.resources];
                } catch (e) {
                    console.debug(`Server resources not available for ${client.getServerVersion()?.name}`);
                }

                const clientInfo = client.getServerVersion();
                if (!clientInfo) {
                    console.warn('Client info not available');

                }

                servers.push({
                    // id: clientInfo?.name,
                    name: client.name,
                    enabled: isConnected ?? false,
                    tools: tools,
                    resources: resources,
                    command: client.command,
                });
            }

            // Send tools for each server separately after initial state
            // This ensures proper tool registration in the UI
            for (const server of servers) {
                if (server.tools && server.tools.length > 0) {
                    this._view.webview.postMessage({
                        type: 'updateServerTools',
                        name: server.name,
                        tools: server.tools,
                        enabled: server.enabled,
                    });
                }
            }
            this._view.webview.postMessage({
                type: 'setServers',
                servers: servers
            });
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

                case 'addServer':
                    if (message.server) {
                        console.log('Adding server: ', message.server);
                        const serverType = message.server.type || ServerType.PROCESS;

                        try {
                            // const { cmd, args: actualArgs } = findActualExecutable(command, args);
                            const client = await installDynamicToolsExt({
                                context: this.context,
                                serverName: message.server.name,
                                command: message.server.command,
                                env: { ...(message.server.env ?? {}) },
                                transport: serverType,
                                url: serverType === ServerType.SSE ? message.server.url : undefined
                            });
                            this.clients.push(client);
                            await createToolsExtension(this.clients, this.context);
                            const config = vscode.workspace.getConfiguration('mcpManager');
                            const servers = config.get<ServerConfig[]>('servers', []);
                            servers.push({
                                name: message.server.name,
                                command: message.server.command,
                                type: serverType,
                                enabled: true,
                                url: serverType === ServerType.SSE ? message.server.url : undefined,
                                authToken: message.server.authToken,
                                env: { ...(message.server.env ?? {}) },
                            });
                            await config.update('servers', servers, vscode.ConfigurationTarget.Global);
                            await this._sendInitialState();
                            this._logger?.log(`Has Name? ${client.getServerVersion()?.name}`);
                            this._logger?.log(`Check VSCode Tools: ${JSON.stringify(vscode.lm.tools)}`);
                            if (this._logger) {
                                this._logger.log(`Added ${serverType} server: ${client}`);
                            }

                            // Send success message back to webview
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverAdded',
                                    serverName: message.server.name
                                });
                            }
                        } catch (error) {
                            console.error('Error adding server:', error);
                            if (this._logger) {
                                this._logger.error(`Error adding server: ${error}`);
                            }

                            // Send error message back to webview
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverAddError',
                                    serverName: message.server.name,
                                    error: error instanceof Error ? error.message : String(error)
                                });
                            }
                        }
                    }
                    break;

                case 'removeServer':
                    if (message.name) {
                        try {
                            console.log('Removing server: ', message.name);

                            // Close the client if it exists
                            const client = this.clients.find(client => client.name === message.name);
                            if (client) {
                                // Unregister tools for this server before closing the client
                                unregisterServerTools(message.name);

                                await client.close();
                                this.clients = this.clients.filter(c => c.name !== message.name);
                            }

                            // Remove from configuration
                            const config = vscode.workspace.getConfiguration('mcpManager');
                            const servers = config.get<ServerConfig[]>('servers', []);
                            const updatedServers = servers.filter(s => s.name !== message.name);
                            await config.update('servers', updatedServers, vscode.ConfigurationTarget.Global);
                            await createToolsExtension(this.clients, this.context);
                            // Update the UI
                            await this._sendInitialState();

                            console.log(`Removed server: ${message.name}`);
                        } catch (error) {
                            console.error(`Error removing server ${message.name}:`, error);
                            // Maybe show an error message?
                        }
                    }
                    break;

                case 'editServer':
                    if (message.server) {
                        try {
                            console.log('Editing server: ', message.server);
                            const newServerName = message.server.name;
                            // Use the original name to find the server in configuration
                            const originalServerName = message.server.originalName || newServerName;
                            const serverType = message.server.type || ServerType.PROCESS;

                            // Get the current server configuration
                            const config = vscode.workspace.getConfiguration('mcpManager');
                            const servers = config.get<ServerConfig[]>('servers', []);
                            // Find the server using the original name
                            const serverIndex = servers.findIndex(s => s.name === originalServerName);

                            if (serverIndex === -1) {
                                throw new Error(`Server "${originalServerName}" not found`);
                            }

                            // Get the existing client
                            const existingClient = this.clients.find(client => client.name === originalServerName);
                            if (existingClient) {
                                // Close the existing client
                                await existingClient.close();
                                this.clients = this.clients.filter(c => c.name !== originalServerName);
                            }

                            // Create a new client with the updated configuration
                            const client = await installDynamicToolsExt({
                                context: this.context,
                                serverName: newServerName, // Use the new name for the new client
                                command: message.server.command,
                                env: { ...(message.server.env ?? {}) },
                                transport: serverType,
                                url: serverType === ServerType.SSE ? message.server.url : undefined
                            });
                            this.clients.push(client);

                            // Update the server configuration
                            const oldServer = servers[serverIndex];
                            const updatedServer = {
                                ...oldServer,  // Start with existing properties
                                // Apply new properties from the message, including the new name
                                name: newServerName,
                                type: serverType,
                                enabled: true,
                                command: message.server.command,
                                url: message.server.url,
                                authToken: message.server.authToken,
                                env: message.server.env
                            };
                            servers[serverIndex] = updatedServer;

                            await config.update('servers', servers, vscode.ConfigurationTarget.Global);
                            await this._sendInitialState();

                            // Send success message back to webview
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverEdited',
                                    serverName: newServerName,
                                    originalName: originalServerName
                                });
                            }

                            this._logger?.log(`Edited server: ${originalServerName} -> ${newServerName}`);
                        } catch (error) {
                            console.error('Error editing server:', error);
                            if (this._logger) {
                                this._logger.error(`Error editing server: ${error}`);
                            }

                            // Send error message back to webview
                            if (this._view) {
                                this._view.webview.postMessage({
                                    type: 'serverEditError',
                                    serverName: message.server.name,
                                    error: error instanceof Error ? error.message : String(error)
                                });
                            }
                        }
                    }
                    break;

                case 'toggleServer':
                    if (message.name !== undefined) {
                        // Get running servers from the server manager
                        const client = this.clients.find(client => client.getServerVersion()?.name === message.name);
                        if (!client) {
                            return;
                        }
                        const isRunning = await client.ping();
                        if (!isRunning) {
                            // toggle the server on
                            console.log('Starting server: ', message.name);
                            await client.transport?.start();
                            if (this._logger) {
                                this._logger.log(`Started server: ${message.name}`);
                            }
                        } else {
                            // toggle the server off
                            await client.close();
                            if (this._logger) {
                                this._logger.log(`Stopped server: ${message.name}`);
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
        clients: NamedClient[]
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