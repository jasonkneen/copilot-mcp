// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ChildProcess, spawn } from 'child_process';
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CallToolRequest, Resource, Tool } from "@modelcontextprotocol/sdk/types";
import { ChatHandler } from './chat/ChatHandler';
import { ToolManager } from './managers/ToolManager';
import { ResourceManager } from './managers/ResourceManager';


interface ServerConfig {
	id: string;
	name: string;
	command: string;
	enabled: boolean;
	env?: { [key: string]: string };
}

interface ServerProcess {
	process: ChildProcess;
	outputChannel: vscode.OutputChannel;
	mcpClient?: MCPClient;
	tools: Tool[];
	resources: Resource[];
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Starting activation of copilot-mcp extension...');
	
	try {
		// Initialize the ToolManager for managing tool registrations
		const toolManager = new ToolManager(context);
		
		// Initialize the ResourceManager for managing resources
		const resourceManager = new ResourceManager(context);
		
		console.log('Registering MCPServerViewProvider...');
		const provider = new MCPServerViewProvider(context.extensionUri, context, toolManager, resourceManager);
		
		// Log the extension's root path to verify resource locations
		console.log('Extension URI:', context.extensionUri.fsPath);
		console.log('Expected icon path:', path.join(context.extensionUri.fsPath, 'media', 'server.svg'));

		const viewDisposable = vscode.window.registerWebviewViewProvider(
			MCPServerViewProvider.viewType,
			provider
		);
		console.log('WebviewViewProvider registered successfully');
		context.subscriptions.push(viewDisposable);

		const cmdDisposable = vscode.commands.registerCommand('copilot-mcp.openServerManager', async () => {
			console.log('Executing openServerManager command...');
			try {
				await vscode.commands.executeCommand('workbench.view.extension.mcpServers');
				console.log('View opened successfully');
			} catch (error: unknown) {
				console.error('Error opening view:', error);
			}
		});
		context.subscriptions.push(cmdDisposable);

		// Register the ChatHandler for chat integration
		const chatParticipant = ChatHandler.register(context, toolManager, resourceManager);
		
		// Add disposables to context
		context.subscriptions.push(
			{ dispose: () => provider.dispose() },
			{ dispose: () => toolManager.dispose() },
			{ dispose: () => resourceManager.dispose() },
			chatParticipant
		);
		
		console.log('copilot-mcp extension activated successfully');
	} catch (error) {
		console.error('Error during extension activation:', error);
		throw error;
	}
}



// This method is called when your extension is deactivated
export function deactivate() {
	// The dispose method of the provider will be called through the subscription
}

class MCPServerViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mcpServerManager';
	private _view?: vscode.WebviewView;
	private _servers: ServerConfig[] = [];
	private _processes: Map<string, ServerProcess> = new Map();

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext,
		private readonly _toolManager: ToolManager = new ToolManager(_context),
		private readonly _resourceManager: ResourceManager = new ResourceManager(_context)
	) {
		
		// Load initial server configurations and start enabled servers
		this._loadServers().then(() => {
			// Start all enabled servers
			this._servers
				.filter(server => server.enabled)
				.forEach(server => this._startServer(server).catch(error => {
					console.error(`Failed to auto-start server ${server.name}:`, error);
					vscode.window.showErrorMessage(`Failed to auto-start server "${server.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
				}));
		});
		
		// Register resource read command
		const readResourceHandler = async (uri: string) => {
			// Use the resource manager to get the resources
			const resources = this._resourceManager.getAllResources();
			const resource = resources.find(r => r.uri === uri);
			
			if (resource) {
				// Find the server process that has the resource
				for (const [serverId, process] of this._processes.entries()) {
					if (process.mcpClient) {
						try {
							const resourceContent = await process.mcpClient.readResource({ uri: resource.uri });
							console.log('Resource content:', resourceContent);
							
							// Handle the resource content
							if (resourceContent.contents && resourceContent.contents.length > 0) {
								const content = resourceContent.contents[0];
								if (typeof content.text === 'string') {
									return content.text;
								}
							}
						} catch (error) {
							console.error(`Error reading resource from server ${serverId}:`, error);
						}
					}
				}
				return 'Could not read resource content';
			} else {
				return 'Resource not found';
			}
			
			return 'Click one of the buttons to read the resource';
		};
		
		// Register the command
		const cmdDisposable = vscode.commands.registerCommand(
			`copilot-mcp.readResource`, 
			readResourceHandler
		);
		this._context.subscriptions.push(cmdDisposable);
	}

	// Chat handling is now entirely managed by the ChatHandler class

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			],
			// localResourceRoots: [vscode.Uri.joinPath(this._extensionUri)]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
			try {
				switch (message.type) {
					case 'getServers':
						this._view?.webview.postMessage({ type: 'setServers', servers: this._servers });
						break;

					case 'addServer':
						console.log("Received addServer message:", message);
						const newServer: ServerConfig = {
							id: crypto.randomUUID(),
							name: message.server?.name || 'Unnamed Server',
							command: message.server?.command || '',
							enabled: message.server?.enabled || false,
							env: message.server?.env || {}
						};
						this._servers.push(newServer);
						await this._saveServers();
						this._view?.webview.postMessage({ type: 'setServers', servers: this._servers });
						await this._startServer(newServer);
						
						break;

					case 'editServer':
						const serverToEdit = this._servers.find(s => s.id === message.server.id);
						if (serverToEdit) {
							const wasEnabled = serverToEdit.enabled;
							
							// Update server config
							serverToEdit.name = message.server?.name || 'Unnamed Server';
							serverToEdit.command = message.server?.command || '';
							serverToEdit.enabled = message.server.enabled || false;
							serverToEdit.env = message.server.env || {};

							console.log(`Server updated: ${serverToEdit.id} - ${serverToEdit.name}`);
							
							// If server was running, restart it with new command
							if (wasEnabled) {
								await this._stopServer(serverToEdit.id);
								await this._startServer(serverToEdit);
							}
							
							await this._saveServers();
							this._view?.webview.postMessage({ type: 'updateServer', server: serverToEdit });
						}
						break;

					case 'removeServer':
						await this._stopServer(message.id);
						const index = this._servers.findIndex(s => s.id === message.id);
						if (index !== -1) {
							this._servers.splice(index, 1);
							await this._saveServers();
							this._view?.webview.postMessage({ type: 'setServers', servers: this._servers });
						}
						break;

					case 'toggleServer':
						const server = this._servers.find(s => s.id === message.id);
						if (server) {
							if (message.enabled) {
								await this._startServer(server);
							} else {
								await this._stopServer(server.id);
							}
							server.enabled = message.enabled;
							await this._saveServers();
							this._view?.webview.postMessage({ type: 'updateServer', server });
						}
						break;
				}
			} catch (error) {
				console.error('Error handling message:', error);
				vscode.window.showErrorMessage('Error handling server operation');
			}
		});
	}

	// These methods are now handled by the ResourceManager and ToolManager classes

	private async _connectMCPClient(serverId: string, process: ChildProcess, outputChannel: vscode.OutputChannel): Promise<void> {
		try {
			outputChannel.appendLine('Initializing MCP client...');
			
			// Create MCP client
			const client = new MCPClient(
				{ name: "copilot-mcp", version: "1.0" },
				{ capabilities: { tools: {}, resources: {}, prompts: {} } }
			);

			// Parse command and arguments
			const [cmd, ...args] = process.spawnargs;

			// Create transport using process stdio
			const transport = new StdioClientTransport({ command: cmd, args });

			// Connect client
			await client.connect(transport);
			outputChannel.appendLine('MCP client connected successfully');
			
			// Get initial tool list
			const toolsResponse = await client.listTools();
			const tools = (toolsResponse.tools ?? []);
			outputChannel.appendLine(`Retrieved ${tools.length} tools from server`);

			// Get initial resource list
			let resources: Resource[] = [];
			try {
				const resourcesResponse = await client.listResources();
				resources = (resourcesResponse.resources ?? []);
				outputChannel.appendLine(`Retrieved ${resources.length} resources from server`);
			} catch (error) {
				console.log(`Error retrieving resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}

			// Store client and tools
			const serverProcess = this._processes.get(serverId);
			if (!serverProcess) {return;}
			
			serverProcess.mcpClient = client;
			serverProcess.tools = tools;
			serverProcess.resources = resources;
			
			// Register tools and resources using the managers
			await this._resourceManager.registerResources(serverId, client, resources);
			await this._toolManager.registerTools(serverId, client, tools);
			
			// Notify UI of updated tools
			this._updateWebviewWithToolsAndResources(serverId, tools, resources);

		} catch (error) {
			outputChannel.appendLine(`Failed to initialize MCP client: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}
	
	/**
	 * Update the webview with tools and resources for a server
	 * @param serverId The server ID 
	 * @param tools The tools to display
	 * @param resources The resources to display
	 */
	private _updateWebviewWithToolsAndResources(serverId: string, tools: Tool[], resources: Resource[]) {
		if (!this._view) {
			return;
		}
		
		// Find the server
		const server = this._servers.find(s => s.id === serverId);
		if (!server) {
			return;
		}
		
		// Update the webview
		this._view.webview.postMessage({
			type: 'updateServerTools',
			serverId,
			tools
		});
		
		console.log(`Updated webview with ${tools.length} tools for server ${serverId}`);
	}

	// This method has been replaced by _updateWebviewWithToolsAndResources

	private async _startServer(server: ServerConfig): Promise<void> {
		try {
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
			this._processes.set(server.id, { process: serverProcess, outputChannel, tools: [], resources: [] });

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
					await this._saveServers();
					this._view?.webview.postMessage({ 
						type: 'updateServer', 
						server: currentServer,
						tools: [] // Clear tools when server stops
					});
					
					if (code !== 0) {
						vscode.window.showErrorMessage(`Server "${currentServer.name}" crashed with exit code ${code}`);
					}
				}

				// Clean up
				this._processes.delete(server.id);
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

			vscode.window.showInformationMessage(`Server "${server.name}" started successfully`);

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Failed to start server "${server.name}": ${errorMessage}`);
			throw error;
		}
	}

	private async _stopServer(serverId: string): Promise<void> {
		const serverProcess = this._processes.get(serverId);
		if (!serverProcess) {
			return;
		}

		try {
			// Unregister tools and resources using the managers
			this._toolManager.unregisterTools(serverId);
			this._resourceManager.unregisterResources(serverId);

			const { process, outputChannel, mcpClient } = serverProcess;
			
			// Clean up MCP client if it exists
			if (mcpClient) {
				try {
					// Clean up any MCP client resources if needed
					mcpClient.fallbackNotificationHandler = undefined;
				} catch (error) {
					console.error('Error cleaning up MCP client:', error);
				}
			}
			
			// Send SIGTERM to the process
			process.kill();
			
			// Wait for the process to exit
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					process.kill('SIGKILL');
					reject(new Error('Process did not exit gracefully'));
				}, 5000);

				process.once('exit', () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			outputChannel.appendLine('\nServer stopped');
			this._processes.delete(serverId);
			
			const server = this._servers.find(s => s.id === serverId);
			if (server) {
				// Notify UI that server stopped and tools are no longer available
				this._view?.webview.postMessage({
					type: 'updateServer',
					server,
					tools: []
				});
				vscode.window.showInformationMessage(`Server "${server.name}" stopped successfully`);
			}

		} catch (error) {
			const server = this._servers.find(s => s.id === serverId);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Error stopping server "${server?.name}": ${errorMessage}`);
			throw error;
		}
	}

	private async _loadServers() {
		const config = vscode.workspace.getConfiguration('mcpManager');
		this._servers = config.get<ServerConfig[]>('servers', []);
		
		// When loading servers, send the current state including tools
		if (this._view) {
			const serversWithTools = this._servers.map(server => {
				const process = this._processes.get(server.id);
				return {
					...server,
					tools: process?.tools || []
				};
			});
			this._view.webview.postMessage({ type: 'setServers', servers: serversWithTools });
		}
	}

	private async _saveServers() {
		const config = vscode.workspace.getConfiguration('mcpManager');
		await config.update('servers', this._servers, vscode.ConfigurationTarget.Global);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));

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
				</script>
				<script src="${scriptUri}" async defer></script>
				<script>
					// More debug logging
					console.log('Debug: After script tag');
					window.addEventListener('load', () => {
						console.log('Debug: Window loaded');
						console.log('Debug: React available:', typeof React !== 'undefined');
						console.log('Debug: Root element:', document.getElementById('root'));
					});
				</script>
			</body>
			</html>`;
	}

	public async dispose() {
		// Dispose our managers
		this._toolManager.dispose();
		this._resourceManager.dispose();

		// Stop all running servers
		for (const [serverId, { process, outputChannel }] of this._processes.entries()) {
			try {
				await this._stopServer(serverId);
			} catch (error) {
				console.error(`Error stopping server ${serverId}:`, error);
			} finally {
				outputChannel.dispose();
			}
		}
		this._processes.clear();
	}
}

// McpProxyTool has been moved to its own file
// async function onServerStarted(serverProcess: ServerProcess) {
// 	if (serverProcess.mcpClient) {
// 		const toolDefs = await serverProcess.mcpClient.listTools();
// 		if (toolDefs) {
// 			registerMcpTools(toolDefs, serverProcess.mcpClient);
// 		}
// 	}
// }

interface WebviewMessage {
	type: string;
	server: {
		id: string;
		name: string;
		command: string;
		enabled: boolean;
		env: { [key: string]: string };
	};
	id: string;
	enabled: boolean;
}
