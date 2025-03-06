// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';

// Import our architectural components
import { ChatHandler } from './chat/ChatHandler';
import { Logger, LogLevel } from './utils/Logger';
import { ErrorHandler } from './utils/ErrorHandler';
import { ServerViewProvider } from './ui/ServerViewProvider';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerType } from './server/ServerConfig';
import { ServerConfig } from './server/ServerConfig';
import { installDynamicToolsExt, createToolsExtension, NamedClient } from './tools';
// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
    console.log('Starting activation of copilot-mcp extension...');
    try {
        // Initialize the logger for the extension
        const logger = Logger.initialize(context, 'MCP Server Manager', LogLevel.Debug);
        logger.log('Initializing extension...');

        // Get servers from configuration
        const config = vscode.workspace.getConfiguration('mcpManager');
        const servers = config.get<ServerConfig[]>('servers', []);
        logger.log(`Servers: ${JSON.stringify(servers)}`);
        const clients: NamedClient[] = [];
        const toolsList = [];
        for (const server of servers) {
            logger.log(`Installing dynamic tools ext for server`);
            const client = await installDynamicToolsExt({
                context,
                serverName: server.name.trim(),
                command: server.command,
                env: { ...(server.env ?? {}) },
                transport: server.type === ServerType.PROCESS ? 'stdio' : 'sse',
                url: server.type === ServerType.SSE ? server.url : undefined
            });
            clients.push(client);
            const toolsResponse = await client.listTools();
            if (toolsResponse.tools) {
                toolsList.push(...toolsResponse.tools);
            }
            const serverInfo = client.getServerVersion();
            if (serverInfo && serverInfo.name) {
                logger.log(`Server ${server.name} added with client ID ${serverInfo.name}`);
            } else {
                logger.warn(`Could NOT get server name for added server ${server.name}`);
            }

        }
        await createToolsExtension(clients, context);
        // Register the WebView Provider using our ServerViewProvider class
        const serverViewProvider = await ServerViewProvider.createOrShow(context, clients);
        logger.log('WebView provider registered');

        // Register the openServerManager command
        const openManagerCommand = vscode.commands.registerCommand('copilot-mcp.openServerManager', async () => {
            try {
                await vscode.commands.executeCommand('workbench.view.extension.mcpServers');
            } catch (error) {
                logger.warn(`Failed to open server manager: ${error}`);
            }
        });
        context.subscriptions.push(openManagerCommand);

        // Register the ChatHandler
        const chatParticipant = ChatHandler.register(context, clients);

        // Add disposables to extension context
        // context.subscriptions.push(chatParticipant);
        logger.log('MCP client manager initialized');

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
        // ErrorHandler.handleError('Extension Activation', error);
        const logger = Logger.getInstance();
        logger.debug(`Error during extension activation: ${error}`);
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

