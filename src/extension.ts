// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ChildProcess, spawn } from 'child_process';
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types";
import { sendChatParticipantRequest, ToolResultMetadata } from '@vscode/chat-extension-utils';
import { ToolCallRound, ToolUserPrompt, TsxToolUserMetadata } from '@vscode/chat-extension-utils/dist/toolsPrompt';
import { renderPrompt } from '@vscode/prompt-tsx';


interface ServerConfig {
	id: string;
	name: string;
	command: string;
	enabled: boolean;
}

interface ServerProcess {
	process: ChildProcess;
	outputChannel: vscode.OutputChannel;
	mcpClient?: MCPClient;
	tools: Tool[];
	toolUpdateInterval?: NodeJS.Timeout;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Starting activation of copilot-mcp extension...');
	
	try {
		console.log('Registering MCPServerViewProvider...');
		const provider = new MCPServerViewProvider(context.extensionUri, context);
		
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

		// Store provider reference for cleanup
		context.subscriptions.push({ dispose: () => provider.dispose() });
		const copilotMCP = vscode.chat.createChatParticipant('copilot-mcp.mcp', provider.chatHandler);
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
	private _toolRegistrations: Map<string, vscode.Disposable[]> = new Map();
	private _toolInstances: vscode.LanguageModelChatTool[] = [];

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
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
	}

	public chatHandler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	  ): Promise<any> => {
		const tools = this.getAllTools();
		console.log("Available tools:", tools);
		const chatResult = sendChatParticipantRequest(request, context, {
			responseStreamOptions: {
				stream,
				references: true,
				responseText: true
			},
			tools: tools
		}, token);
		return await chatResult.result;
	};

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
						const newServer: ServerConfig = {
							id: crypto.randomUUID(),
							name: message.server?.name || 'Unnamed Server',
							command: message.server?.command || '',
							enabled: false
						};
						this._servers.push(newServer);
						await this._saveServers();
						this._view?.webview.postMessage({ type: 'setServers', servers: this._servers });
						break;

					case 'editServer':
						const serverToEdit = this._servers.find(s => s.id === message.server.id);
						if (serverToEdit) {
							const wasEnabled = serverToEdit.enabled;
							
							// Update server config
							serverToEdit.name = message.server?.name || 'Unnamed Server';
							serverToEdit.command = message.server?.command || '';
							

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

	private async _registerTools(serverId: string, client: MCPClient, tools: Tool[]) {
		// Unregister any existing tools for this server
		await this._unregisterTools(serverId);

		const registrations: vscode.Disposable[] = [];
		const toolInstances: vscode.LanguageModelChatTool[] = [];

		for (const tool of tools) {
			try {
				console.log('Registering tool:', tool); // Debug log
				if (!tool.name) {
					console.warn('Tool missing name:', tool);
					continue;
				}

				// Create unique tool ID by combining serverId and tool name
				const toolName = tool.name;
				const chatTool = new McpProxyTool(client, tool);
				
				
				const registration = vscode.lm.registerTool(toolName, chatTool);
				registrations.push(registration);
				toolInstances.push(chatTool);
				
				console.log(`Registered tool: ${toolName}`);
			} catch (error) {
				console.error(`Failed to register tool:`, tool, error);
			}
		}

		if (registrations.length > 0) {
			this._toolRegistrations.set(serverId, registrations);
			this._toolInstances.push(...toolInstances);
			// Add to extension subscriptions for cleanup
			this._context.subscriptions.push(...registrations);
		}
	}

	private async _unregisterTools(serverId: string) {
		const registrations = this._toolRegistrations.get(serverId);
		if (registrations) {
			registrations.forEach(registration => registration.dispose());
			this._toolRegistrations.delete(serverId);
		}
	}

	private async _connectMCPClient(serverId: string, process: ChildProcess, outputChannel: vscode.OutputChannel): Promise<void> {
		try {
			outputChannel.appendLine('Initializing MCP client...');
			
			// Create MCP client
			const client = new MCPClient(
				{ name: "vscode-extension", version: "1.0" },
				{ capabilities: { tools: {} } }
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

			// Store client and tools
			const serverProcess = this._processes.get(serverId);
			if (!serverProcess) {return;}
			
			serverProcess.mcpClient = client;
			serverProcess.tools = tools;
			
			// Register tools with VS Code
			await this._registerTools(serverId, client, tools);

			// Notify UI of tools
			this._view?.webview.postMessage({
				type: 'updateServerTools',
				serverId,
				tools: tools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema
				}))
			});
			
			// Set up tool list update handler
			const updateToolList = async () => {
				try {
					const updatedToolsResponse = await client.listTools();
					const updatedTools = (updatedToolsResponse.tools ?? []);
					const serverProcess = this._processes.get(serverId);
					if (serverProcess) {
						serverProcess.tools = updatedTools;
						
						// Update tool registrations
						await this._registerTools(serverId, client, updatedTools);

						// Notify UI of updated tools
						this._view?.webview.postMessage({
							type: 'updateServerTools',
							serverId,
							tools: updatedTools.map((tool) => ({
								name: tool.name,
								description: tool.description,
								inputSchema: tool.inputSchema
							}))
						});
					}
				} catch (error) {
					console.error('Error handling tools changed event:', error);
					outputChannel.appendLine(`Error updating tool list: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			};

			// Update tools periodically
			// const toolUpdateInterval = setInterval(updateToolList, 5000);
			// serverProcess.toolUpdateInterval = toolUpdateInterval;

		} catch (error) {
			outputChannel.appendLine(`Failed to initialize MCP client: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		}
	}

	private async _startServer(server: ServerConfig): Promise<void> {
		try {
			// Create output channel for the server
			const outputChannel = vscode.window.createOutputChannel(`MCP Server: ${server.name}`);
			outputChannel.show();
			outputChannel.appendLine(`Starting server: ${server.name}`);
			outputChannel.appendLine(`Command: ${server.command}`);

			// Parse command and arguments
			const [cmd, ...args] = server.command.split(' ');
			
			// Spawn the process
			const process = spawn(cmd, args, {
				stdio: 'pipe',
				shell: true
			});

			// Store process and output channel
			this._processes.set(server.id, { process, outputChannel, tools: [] });

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
			process.on('error', (err: Error) => {
				outputChannel.appendLine(`\nProcess error: ${err.message}`);
				vscode.window.showErrorMessage(`Failed to start server "${server.name}": ${err.message}`);
			});

			// Wait a bit to see if the process starts successfully
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			if (process.exitCode !== null) {
				throw new Error(`Process exited immediately with code ${process.exitCode}`);
			}

			// Initialize MCP client
			await this._connectMCPClient(server.id, process, outputChannel);

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
			// Unregister tools first
			await this._unregisterTools(serverId);

			const { process, outputChannel, mcpClient } = serverProcess;
			
			// Clean up MCP client if it exists
			if (mcpClient) {
				try {
					if (serverProcess?.toolUpdateInterval) {
						clearInterval(serverProcess.toolUpdateInterval);
					}
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
		// Unregister all tools before stopping servers
		for (const serverId of this._toolRegistrations.keys()) {
			await this._unregisterTools(serverId);
		}

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

	public getAllTools(): vscode.LanguageModelChatTool[] {
		return this._toolInstances;
	}
}

class McpProxyTool implements vscode.LanguageModelTool<any> {
	private _client: MCPClient;
	private _tool: Tool;
	public name: string;
	public inputSchema: Tool['inputSchema'];
	public description: string;

	constructor(client: MCPClient, tool: Tool) {
		this._client = client;
		this._tool = tool;
		this.name = tool.name;
		this.inputSchema = tool.inputSchema;
		this.description = tool.description || '';

		this._client.onclose = () => {
			console.log("MCP client closed");
		};

		this._client.onerror = (error) => {
			console.error("MCP client error:", error);
		};
		
		this._client.fallbackNotificationHandler = this._handleNotification.bind(this);
		
	}

	private _handleNotification(notification: any): Promise<void> {
		console.log("Received notification:", notification);
		return Promise.resolve();
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationOptions<any>): Promise<{ confirmationMessage?: string; invocationMessage?: string }> {
		return {
			confirmationMessage: `Allow tool "${this._tool.name}" to run?`,
			invocationMessage: `Running tool "${this._tool.name}"...`
		};
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<any>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		console.log("Invoking tool:", this._tool.name, options.input);
		try{
			const ping = await this._client.ping();
		} catch(e) {
			console.log("Reconnecting with transport:", this._client.transport);
			await this._client.transport?.start();
		}
		try {
			// Define the payload
			const payload: CallToolRequest["params"] = {
				name: this._tool.name,
				arguments: options.input,
				// _meta: {
				// 	toolCallId: options.toolInvocationToken,
				// 	progressToken: options.toolInvocationToken
				// }
			};
			console.log("CallToolRequest Params:", payload);
			const result = await this._client.callTool(payload, );
			console.log("Tool result:", result);
			// Convert MCP result to LanguageModelToolResult
			let content: (vscode.LanguageModelTextPart | vscode.LanguageModelPromptTsxPart)[] = [];
			if (Array.isArray(result.content)) {
				for (const item of result.content) {
					if (item.type === 'text' && typeof item.text === 'string') {
						content.push(new vscode.LanguageModelTextPart(item.text));
					}
				}
			}

			return new vscode.LanguageModelToolResult(content);
		} catch (error) {
			console.error('Tool invocation error:', error);
			throw new Error(`Tool "${this._tool.name}" failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
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
	};
	id: string;
	enabled: boolean;
}
