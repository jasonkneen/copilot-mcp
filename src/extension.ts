// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import our architectural components
import { ChatHandler } from './chat/ChatHandler';
import { Logger, LogLevel } from './utils/Logger';
import { ErrorHandler } from './utils/ErrorHandler';
import { ServerViewProvider } from './ui/ServerViewProvider';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerType } from './server/ServerConfig';
import { ServerConfig } from './server/ServerConfig';
import { installDynamicToolsExt } from './tools';
import { SimpleMcpSseServer } from './server/SimpleMcpSseServer';
import { v4 as uuidv4 } from 'uuid';
import { InstanceManager } from './utils/InstanceManager';
import { ServerInstancesStatusProvider } from './ui/ServerInstancesStatusProvider';
import { ServerInstancesViewProvider } from './ui/ServerInstancesViewProvider';

/**
 * Read server configuration from ~/.mcpsx/config.json
 * @param logger Logger instance for logging errors
 * @returns Array of server configurations
 */
function readServerConfigFromFile(logger: Logger): ServerConfig[] {
    const configPath = path.join(os.homedir(), '.mcpsx', 'config.json');
    
    try {
        // Check if file exists
        if (fs.existsSync(configPath)) {
            // Read and parse the file
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            // Extract servers array
            if (config && config.servers && Array.isArray(config.servers)) {
                logger.log(`Successfully read server configuration from ${configPath}`);
                return config.servers;
            }
        }
        
        // File doesn't exist or doesn't contain servers
        return [];
    } catch (error) {
        logger.error(`Error reading config from ${configPath}: ${error}`);
        return [];
    }
}

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
    console.log('Starting activation of copilot-mcpsx extension...');
    try {
        // Initialize the logger for the extension
        const logger = Logger.initialize(context, 'mcpsx-run', LogLevel.Debug);
        logger.log('Initializing extension...');
        
        // Initialize the instance manager and clean up stale instances
        const instanceManager = InstanceManager.getInstance();
        instanceManager.cleanupStaleInstances();
        logger.log('Cleaned up stale server instances');
        
        // Create and initialize the server instances status provider
        const serverInstancesStatusProvider = new ServerInstancesStatusProvider();
        
        // Register the server instances view provider
        const serverInstancesViewProvider = ServerInstancesViewProvider.registerProvider(context);
        logger.log('Server instances view provider registered');
        
        // Get servers from ~/.mcpsx/config.json
        let servers = readServerConfigFromFile(logger);
        
        // Check if servers are missing or empty, add a default empty server for the user to configure
        if (!servers || servers.length === 0) {
            logger.log('No servers found in configuration, initializing with an empty server');
            
            // Create a single empty server with just an ID
            const serverId = uuidv4();
            
            servers = [
                {
                    id: serverId,
                    name: "My MCP Server",
                    command: "",
                    enabled: true,
                    chatParticipant: {
                        enabled: true,
                        name: "My MCP Server",
                        description: "Tools for My MCP Server",
                        isSticky: false
                    }
                }
            ];
        }
        
        // Log detailed configuration information for debugging
        logger.log(`Configuration read from: ~/.mcpsx/config.json`);
        logger.log(`Full server configuration: ${JSON.stringify(servers, null, 2)}`);
        
        // Log the configuration section info
        logger.log(`Found ${servers.length} server(s) in configuration`);
        const clients: Client[] = [];
        for(const server of servers) {
            logger.log(`Installing dynamic tools ext for server`);
            
            // Skip invalid server configurations
            if (!server.command && server.type !== ServerType.SSE) {
                logger.warn(`Skipping server with missing command: ${JSON.stringify(server)}`);
                continue;
            }
            
            if (server.type === ServerType.SSE && !server.url) {
                logger.warn(`Skipping SSE server with missing URL: ${JSON.stringify(server)}`);
                continue;
            }
            
            // Ensure server.name is defined before calling trim()
            const serverName = server.name ? server.name.trim() : 'unnamed-server';
            
            // Get all server names for dynamic placeholders
            const allServerNames = servers.map(s => s.name ? s.name.trim() : 'unnamed-server');
            
            try {
                const client = await installDynamicToolsExt({
                    context,
                    serverName,
                    chatParticipantName: server.chatParticipant?.name,
                    isSticky: server.chatParticipant?.isSticky,
                    allServerNames,
                    command: server.command,
                    env: {...(server.env ?? {})},
                    transport: server.type === ServerType.PROCESS ? 'stdio' : 'sse',
                    url: server.type === ServerType.SSE ? server.url : undefined
                });
                
                clients.push(client);
                const serverInfo = client.getServerVersion();
                if(serverInfo && serverInfo.name) {
                    logger.log(`Server ${serverName} added with client ID ${serverInfo.name}`);
                } else {
                    logger.warn(`Could NOT get server name for added server ${serverName}`);
                }
            } catch (error) {
                logger.error(`Failed to install dynamic tools for server ${serverName}: ${error}`);
            }
            
        }

        // Create and start the MCP SSE server on port 3000
        const mcpServer = new SimpleMcpSseServer(3000);
        
        // Register all clients with the server
        const allServerNames: string[] = [];
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const serverInfo = client.getServerVersion();
            if (serverInfo && serverInfo.name) {
                mcpServer.registerClient(serverInfo.name, client);
                logger.log(`Registered client ${serverInfo.name} with MCP server`);
                allServerNames.push(serverInfo.name);
            }
        }
        
        // Start the server
        try {
            await mcpServer.start();
            logger.log('MCP server started successfully');
            
            // Register the server with the context for cleanup
            context.subscriptions.push({
                dispose: () => mcpServer.stop()
            });
        } catch (error) {
            logger.error(`Failed to start MCP SSE server: ${error}`);
        }

        // Register the WebView Provider using our ServerViewProvider class
        const serverViewProvider = await ServerViewProvider.createOrShow(context, clients);
        logger.log('WebView provider registered');
        
        // Register the server instances status provider with the server view provider
        serverInstancesStatusProvider.register(serverViewProvider);
        logger.log('Server instances status provider registered');
        
        // Register the openServerManager command
        const openManagerCommand = vscode.commands.registerCommand('mcpsx-run.studio.openServerManager', async () => {
            try {
                await vscode.commands.executeCommand('workbench.view.extension.mcpsx');
            } catch (error) {
                logger.warn(`Failed to open server manager: ${error}`);
            }
        });
        context.subscriptions.push(openManagerCommand);
        
        
        // Register a command to get the MCP server socket path
        const getMcpServerSocketPathCommand = vscode.commands.registerCommand('mcpsx-run.studio.getMcpServerSocketPath', () => {
            try {
                return mcpServer.getUrl();
            } catch (error) {
                logger.error(`Failed to get MCP server socket path: ${error}`);
                return null;
            }
        });
        context.subscriptions.push(getMcpServerSocketPathCommand);
        
        // Register a command to copy the MCP server socket path to the clipboard
        const copyMcpServerSocketPathCommand = vscode.commands.registerCommand('mcpsx-run.studio.copyMcpServerSocketPath', async () => {
            await vscode.env.clipboard.writeText(mcpServer.getUrl());
            vscode.window.showInformationMessage(`MCP server URL copied to clipboard: ${mcpServer.getUrl()}`);
        });
        context.subscriptions.push(copyMcpServerSocketPathCommand);

        // Register main mcpsx-run commands
        const listCommand = vscode.commands.registerCommand('mcpsx-run.studio.servers', async () => {
            try {
                // Show a notification with the number of servers
                vscode.window.showInformationMessage(`${allServerNames.length} MCP servers available`);
                
                // Show servers in a quick pick
                const serverItems = allServerNames.map(name => ({
                    label: name,
                    description: 'MCP Server'
                }));
                
                vscode.window.showQuickPick(serverItems, {
                    placeHolder: 'Select a server to learn more'
                });
            } catch (error) {
                logger.error(`Failed to list servers: ${error}`);
                vscode.window.showErrorMessage(`Failed to list servers: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        context.subscriptions.push(listCommand);
        
        const toolsCommand = vscode.commands.registerCommand('mcpsx-run.studio.tools', async () => {
            try {
                // Get all tools with the mcpsx tag
                const tools = vscode.lm.tools.filter(tool => tool.tags?.includes('mcpsx'));
                
                if (tools.length === 0) {
                    vscode.window.showInformationMessage('No MCP tools available');
                    return;
                }
                
                // Show a notification with the number of tools
                vscode.window.showInformationMessage(`${tools.length} MCP tools available`);
                
                // Show tools in a quick pick
                const toolItems = tools.map(tool => {
                    // Find which server this tool belongs to
                    const serverTag = tool.tags?.find(tag => tag !== 'mcpsx');
                    const serverName = serverTag || 'Unknown';
                    
                    return {
                        label: tool.name,
                        description: tool.description || 'No description',
                        detail: `Server: ${serverName}`
                    };
                });
                
                vscode.window.showQuickPick(toolItems, {
                    placeHolder: 'Select a tool to learn more'
                });
            } catch (error) {
                logger.error(`Failed to list tools: ${error}`);
                vscode.window.showErrorMessage(`Failed to list tools: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        context.subscriptions.push(toolsCommand);
        
       /*  const useCommand = vscode.commands.registerCommand('mcpsx-run.studio.use', async () => {
            try {
                // Show servers in a quick pick
                const serverItems = allServerNames.map(name => ({
                    label: name,
                    description: 'MCP Server'
                }));
                
                const selected = await vscode.window.showQuickPick(serverItems, {
                    placeHolder: 'Select a server to use'
                });
                
                if (selected) {
                    vscode.window.showInformationMessage(`Now using server: ${selected.label}`);
                }
            } catch (error) {
                logger.error(`Failed to use server: ${error}`);
                vscode.window.showErrorMessage(`Failed to use server: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
        context.subscriptions.push(useCommand); */

        // Register the ChatHandler
        // Use the new registerForServers method to create dynamic chat participants
        const chatParticipants = ChatHandler.registerForServers(context, clients, servers);

            // Add disposables to extension context
        // context.subscriptions.push(chatParticipant);
        logger.log('MCP client manager initialized');
        
        // Add disposables to extension context
        context.subscriptions.push(...[
            // Core components
            { dispose: () => serverViewProvider.dispose() },
            // Chat participants
            ...chatParticipants
        ]);
        
        logger.log('Extension activation complete');
        console.log('copilot-mcpsx extension activated successfully');
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
        
        // Get logger and instance manager
        const logger = Logger.getInstance();
        const instanceManager = InstanceManager.getInstance();
        
        // Update all instances launched by this extension to 'stopped'
        const extensionInstances = instanceManager.getAllInstances().filter(
            i => i.launchSource === vscode.env.appName && i.status === 'running'
        );
        
        for (const instance of extensionInstances) {
            instanceManager.updateInstanceStatus(instance.id, 'stopped');
            logger.log(`Updated instance ${instance.id} status to stopped during deactivation`);
        }
        
        // Stop the health check
        instanceManager.stopHealthCheck();
        
        // The components will be disposed through the context subscriptions
        console.log('MCP extension deactivated successfully');
    } catch (error) {
        console.error('Error during extension deactivation:', error);
    }
}
