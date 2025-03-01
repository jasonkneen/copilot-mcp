// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';

// Import our architectural components
import { ChatHandler } from './chat/ChatHandler';
import { Logger, LogLevel } from './utils/Logger';
import { ErrorHandler } from './utils/ErrorHandler';
import { ServerViewProvider } from './ui/ServerViewProvider';

import { MCPClientManager, Transport } from '@automatalabs/mcp-client-manager';
import { ServerType } from './server/ServerConfig';
import { ServerConfig } from './server/ServerConfig';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { findActualExecutable } from 'spawn-rx';
// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
    console.log('Starting activation of copilot-mcp extension...');
    
    try {
        // Initialize the logger for the extension
        const logger = Logger.initialize(context, 'MCP Server Manager', LogLevel.Info);
        logger.log('Initializing extension...');
        
        // Initialize the MCP client manager
        const mcpClientManager = new MCPClientManager();
        logger.log('MCP client manager initialized');

        // Get servers from configuration
        const config = vscode.workspace.getConfiguration('mcpManager');
        const servers = config.get<ServerConfig[]>('servers', []);
        const serverClients: string[] = [];
        // Ensure all servers have a type (for backward compatibility)
        for (const server of servers) {
            // We need to split the command into the executable and the arguments
            // Right now, `server.command` is the full command, including arguments
            const [command, ...args] = server.command.split(' ');
            const { cmd, args: actualArgs } = findActualExecutable(command, args);
            logger.log(`Command: ${cmd}, Args: ${actualArgs}`);
            if (!server.type) {
                server.type = ServerType.PROCESS;
            }
            // Create the transport
            let transport: Transport;
            if (server.type === ServerType.PROCESS) {
                transport = new StdioClientTransport({
                    command: cmd,
                    args: actualArgs,
                    env: server.env ?? undefined,
                    stderr: 'pipe'
                });
                const clientId = await mcpClientManager.addServer(transport, server.name);
                console.log(`Server ${server.name} added with client ID ${clientId}`);
                logger.log(`Server ${server.name} added with client ID ${clientId}`);
                serverClients.push(clientId);
            } else if (server.type === ServerType.SSE && server.url) {
                transport = new SSEClientTransport(new URL(server.url), {  });
                const clientId = await mcpClientManager.addServer(transport, server.name);
                logger.log(`Server ${server.name} added with client ID ${clientId}`);
                serverClients.push(clientId);
            }
            
        }
        
        // Register the WebView Provider using our ServerViewProvider class
        const serverViewProvider = await ServerViewProvider.createOrShow(context, mcpClientManager);
        logger.log('WebView provider registered');
        
        // Register the openServerManager command
        const openManagerCommand = vscode.commands.registerCommand('copilot-mcp.openServerManager', async () => {
            try {
                await vscode.commands.executeCommand('workbench.view.extension.mcpServers');
            } catch (error) {
                ErrorHandler.handleError('Open Server Manager', error);
            }
        });
        context.subscriptions.push(openManagerCommand);
        
        // Register the ChatHandler
        const chatParticipant = ChatHandler.register(context, mcpClientManager);
        
        // Add disposables to extension context
        context.subscriptions.push(
            // Core components
            { dispose: () => serverViewProvider.dispose() },
            // Chat participant
            chatParticipant
        );
        
        logger.log('Extension activation complete');
        console.log('copilot-mcp extension activated successfully');
    } catch (error) {
        ErrorHandler.handleError('Extension Activation', error);
        console.error('Error during extension activation:', error);
        vscode.window.showErrorMessage(`Failed to activate the extension: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}



// This method is called when your extension is deactivated
export function deactivate() {
    try {
        console.log('Deactivating MCP extension...');
        
        // The components will be disposed through the context subscriptions
        // Nothing extra to do here for now
        
        console.log('MCP extension deactivated successfully');
    } catch (error) {
        console.error('Error during extension deactivation:', error);
    }
}

