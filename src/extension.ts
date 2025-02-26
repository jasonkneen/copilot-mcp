// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ChildProcess, spawn } from 'child_process';
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CallToolRequest, Resource, Tool } from "@modelcontextprotocol/sdk/types";
import { sendChatParticipantRequest } from '@vscode/chat-extension-utils';

// Import our refactored components
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { ErrorHandler } from './utils/ErrorHandler';
import { ServerViewProvider } from './ui/ServerViewProvider';
import { ToolManager } from './mcp/ToolManager';
import { ResourceManager } from './mcp/ResourceManager';
import { ChatHandler } from './chat/ChatHandler';

/**
 * Extension activation entry point - called by VS Code
 * @param context Extension context
 */
export async function activate(context: vscode.ExtensionContext) {
	try {
		console.log('Starting activation of copilot-mcp extension...');

		// Initialize the logger first so other components can use it
		const logger = new Logger(context, 'MCP Server Manager');
		logger.log('Initializing extension...');

		// Create all the core components of our architecture
		
		// 1. Initialize the ServerManager for handling server lifecycle
		const serverManager = new ServerManager(context);
		await serverManager.loadServers();
		
		// 2. Initialize the ToolManager for managing tool registrations
		const toolManager = new ToolManager(context);
		
		// 3. Initialize the ResourceManager for managing resources
		const resourceManager = new ResourceManager(context);
		
		// 4. Register the WebviewProvider for the UI
		const viewProvider = await ServerViewProvider.createOrShow(context, serverManager);
		
		// 5. Register the ChatHandler for chat integration
		const chatParticipant = ChatHandler.registerChatParticipant(
			context, 
			toolManager, 
			resourceManager
		);
		
		// Add to context subscriptions for proper cleanup
		context.subscriptions.push(
			// Core components
			{ dispose: () => serverManager.dispose() },
			{ dispose: () => toolManager.dispose() },
			{ dispose: () => resourceManager.dispose() },
			{ dispose: () => viewProvider.dispose() },
			// Chat participant
			chatParticipant
		);
		
		// Register commands
		registerCommands(context);
		
		// Start enabled servers
		await serverManager.startEnabledServers();
		
		logger.log('Extension activated successfully');
		console.log('copilot-mcp extension activated successfully');
	} catch (error) {
		ErrorHandler.handleError('Extension Activation', error);
		console.error('Error during extension activation:', error);
		vscode.window.showErrorMessage(`Failed to activate MCP Server Manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Register extension commands
 * @param context Extension context
 */
function registerCommands(
	context: vscode.ExtensionContext
): void {
	// Command to open the server manager UI
	const openServerManagerCmd = vscode.commands.registerCommand(
		'copilot-mcp.openServerManager', 
		async () => {
			try {
				await vscode.commands.executeCommand('workbench.view.extension.mcpServers');
			} catch (error) {
				ErrorHandler.handleError('Open Server Manager', error);
			}
		}
	);
	
	// Command to add a new server
	const addServerCmd = vscode.commands.registerCommand(
		'copilot-mcp.addServer',
		async () => {
			try {
				// This will be handled through the webview interface,
				// but we keep the command for programmatic access
				await vscode.commands.executeCommand('workbench.view.extension.mcpServers');
			} catch (error) {
				ErrorHandler.handleError('Add Server Command', error);
			}
		}
	);
	
	context.subscriptions.push(openServerManagerCmd, addServerCmd);
}

/**
 * Extension deactivation hook - called by VS Code
 */
export function deactivate() {
	try {
		// The components will be disposed through the context subscriptions
		console.log('copilot-mcp extension deactivated');
	} catch (error) {
		console.error('Error during extension deactivation:', error);
	}
}
