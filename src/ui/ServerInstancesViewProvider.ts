import * as vscode from 'vscode';
import { InstanceManager, InstanceEvents, ServerInstance } from '../utils/InstanceManager';
import { Logger } from '../utils/Logger';

/**
 * WebviewProvider for the MCP Server Instances View
 */
export class ServerInstancesViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mcpsxInstancesView';
    private _view?: vscode.WebviewView;
    private _logger: Logger;
    private _instanceManager: InstanceManager;
    private _statusUpdateInterval: NodeJS.Timeout | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {
        this._logger = Logger.getInstance();
        this._instanceManager = InstanceManager.getInstance();

        // Listen for instance changes
        this._instanceManager.on(InstanceEvents.INSTANCES_CHANGED, this._handleInstancesChanged.bind(this));
    }

    /**
     * Handle instances changed event
     */
    private _handleInstancesChanged(instances: ServerInstance[]): void {
        this._updateInstancesStatus();
    }

    /**
     * Set up the webview
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist')
            ]
        };

        // Set initial HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(this._handleMessage, this);

        // Start status updates
        this._startStatusUpdates();
    }

    /**
     * Get HTML for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Create URIs for scripts
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'instancesWebview.js')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:;">
                <title>MCP Server Instances</title>
            </head>
            <body>
                <div id="root"></div>
                <script>
                    // Debug logging
                    console.log('Debug: Starting instances view script execution');
                    window.addEventListener('error', function(event) {
                        console.error('Script error:', event.error);
                    });
                    
                    // Create the vscode API for messaging
                    const vscode = acquireVsCodeApi();
                    window.vscodeApi = vscode;
                </script>
                <script src="${scriptUri}" async defer></script>
            </body>
            </html>`;
    }

    /**
     * Handle messages from the webview
     */
    private _handleMessage(message: any): void {
        switch (message.type) {
            case 'getInstancesStatus':
                this._updateInstancesStatus();
                break;
            
            case 'refreshInstances':
                this._instanceManager.cleanupStaleInstances();
                this._updateInstancesStatus();
                break;
            
            case 'killInstance':
                if (message.id) {
                    this._instanceManager.killInstance(message.id);
                    // Status will update automatically via the event listener
                }
                break;
        }
    }

    /**
     * Start periodic status updates
     */
    private _startStatusUpdates(): void {
        if (this._statusUpdateInterval) {
            clearInterval(this._statusUpdateInterval);
        }
        
        // Update the status every 5 seconds
        this._statusUpdateInterval = setInterval(() => {
            this._updateInstancesStatus();
        }, 5000);
        
        // Do an initial update
        this._updateInstancesStatus();
    }

    /**
     * Stop periodic status updates
     */
    public stopStatusUpdates(): void {
        if (this._statusUpdateInterval) {
            clearInterval(this._statusUpdateInterval);
            this._statusUpdateInterval = null;
        }
    }

    /**
     * Update instances status in the webview
     */
    private _updateInstancesStatus(): void {
        if (!this._view) {
            return;
        }

        const instances = this._instanceManager.getAllInstances();
        const runningInstances = instances.filter(i => i.status === 'running');
        const errorInstances = instances.filter(i => i.status === 'error');
        
        // Group instances by server name
        const instancesByServer = new Map<string, ServerInstance[]>();
        for (const instance of instances) {
            if (!instancesByServer.has(instance.serverName)) {
                instancesByServer.set(instance.serverName, []);
            }
            instancesByServer.get(instance.serverName)?.push(instance);
        }
        
        // Create status data for the webview
        const statusData = {
            totalInstances: instances.length,
            runningCount: runningInstances.length,
            errorCount: errorInstances.length,
            instancesByServer: Object.fromEntries(instancesByServer),
            servers: Array.from(instancesByServer.keys()),
            timestamp: new Date().toISOString()
        };
        
        // Send the status update to the webview
        this._view.webview.postMessage({
            type: 'updateInstancesStatus',
            data: statusData
        });
    }

    /**
     * Register the WebviewProvider in the extension context
     */
    public static registerProvider(context: vscode.ExtensionContext): ServerInstancesViewProvider {
        const provider = new ServerInstancesViewProvider(context);
        
        // Register the webview provider
        const providerRegistration = vscode.window.registerWebviewViewProvider(
            ServerInstancesViewProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        );
        
        context.subscriptions.push(providerRegistration);
        
        return provider;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopStatusUpdates();
    }
}