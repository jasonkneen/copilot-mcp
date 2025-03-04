// File system module for handling files and directories
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { findActualExecutable, spawnPromise } from 'spawn-rx';
import { McpProxyTool } from './tools/McpProxyTool';
import { Logger } from './utils/Logger';
import findCacheDirectory from 'find-cache-dir';
import * as archiver from 'archiver';

export interface RegisterToolsParams {
    context: vscode.ExtensionContext;
    serverName: string;
    allServerNames?: string[];
    chatParticipantName?: string;
    isSticky?: boolean;
    command?: string;
    env?: {
        [key: string]: string;
    }
    transport?: 'stdio' | 'sse';
    url?: string;
}

export const toolsExtTemplate = (serverName: string) => `mcpsx-${serverName}-tools-ext`;

// Map to track which tools belong to which server
const serverToolsMap = new Map<string, vscode.Disposable[]>();

/**
 * Replace placeholders in text with actual values
 * @param text The text containing placeholders
 * @param serverName The server name for this tool
 * @param allServerNames Optional list of all available server names for dynamic replacement
 * @returns The text with placeholders replaced
 */
function replacePlaceholders(text: string, serverName: string, allServerNames?: string[]): string {
    if (!text) { return text; };

    // Create a dynamic map of placeholders based on available server names
    const placeholders: Record<string, string> = {};

    // Add standard references
    //placeholders['@mcp'] = 'MCP';
    //placeholders['@mcps'] = 'MCP Servers';
    //placeholders['@tool'] = 'Tool';
    //placeholders['@tools'] = 'Tools';

    // Add the current server as a placeholder
    placeholders[`@${serverName.toLowerCase().replace(/\s+/g, '')}`] = serverName;

    // Add all other servers as placeholders if provided
    if (allServerNames && Array.isArray(allServerNames)) {
        for (const name of allServerNames) {
            // Only add if not the current server (already added above)
            if (name !== serverName) {
                const placeholder = `@${name.toLowerCase().replace(/\s+/g, '')}`;
                placeholders[placeholder] = name;
            }
        }
    }

    // Replace all placeholders in the text
    let result = text;
    for (const [placeholder, value] of Object.entries(placeholders)) {
        result = result.replace(new RegExp(placeholder + '\\b', 'g'), value);
    }

    return result;
}

export async function installDynamicToolsExt(params: RegisterToolsParams) {
    const logger = Logger.getInstance();
    logger.log(`[DEBUG] Starting dynamic tools extension installation for ${params.serverName}`);
    logger.log(`[DEBUG] Transport type: ${params.transport}`);
    logger.log(`[DEBUG] Server command: ${params.command}`);
    logger.log(`[DEBUG] Server URL: ${params.url}`);
    
    // First, unregister any existing tools for this server
    logger.log(`[DEBUG] Unregistering existing tools for server: ${params.serverName}`);
    unregisterServerTools(params.serverName);
    
    // Then, uninstall any existing extension for this server
    try {
        logger.log(`[DEBUG] Uninstalling existing extension for server: ${params.serverName}`);
        await uninstallToolsExtension(params.serverName);
    } catch (error) {
        // Ignore errors when uninstalling, as the extension might not exist
        logger.log(`[DEBUG] Error uninstalling extension (this is expected if it doesn't exist): ${error}`);
    }

    // 1. Prepare a temporary extension directory
    const extDir = path.join(findCacheDirectory({ name: 'mcpsx' }) ?? tmpdir(), toolsExtTemplate(params.serverName));
    logger.log(`Extension directory: ${extDir}`);
    fs.mkdirSync(extDir, { recursive: true });

    // split the command into args
    const [command, ...pArguments] = params.command?.split(' ') || [];
    const {cmd: pCmd, args: pArgs} = findActualExecutable(command, pArguments);
    const env = {...params.env, ...getDefaultEnvironment() };
    
    logger.log(`[DEBUG] Starting with command: ${pCmd} ${pArgs.join(' ')}`);
    
    const transportParams = {
        command: pCmd,
        args: pArgs,
        env: env,        
        cwd: findCacheDirectory({ name: 'mcpsx' }),
        stderr: "pipe" as const
    };
    
    let transport: Transport;
    // 2. create a client and transport
    if(params.transport === 'stdio' || !params.transport) {
        try {
            logger.log(`[DEBUG] Creating stdio transport`);
            transport = new StdioClientTransport(transportParams);
            transport.onclose = () => {
                logger.warn(`Transport closed`);
            };
            transport.onerror = (e) => {
                logger.warn(`Transport error: ${e}`);
            };
            transport.onmessage = (message) => {
                logger.log(`Transport message: ${message}`);
            };
        } catch(e) {
            logger.warn(`Failed to create stdio transport: ${e}`);
            throw new Error(`Failed to create stdio transport: ${e}`);
        }
    } else if(params.transport === 'sse') {
        if(!params.url) {
            throw new Error('URL is required for SSE transport');
        }
        logger.log(`[DEBUG] Creating SSE transport with URL: ${params.url}`);
        transport = new SSEClientTransport(new URL(params.url));
    } else {
        logger.warn(`Unsupported transport: ${params.transport}`);
        throw new Error(`Unsupported transport: ${params.transport}`);
    }

    // 3. create a client
    logger.log(`[DEBUG] Creating MCP client`);
    const client = new Client(
        {
          name: params.serverName,
          version: "0.0.1"  // Updated version number
        },
        {
          capabilities: {
            prompts: true,
            resources: true,
            tools: true            
          }
        }
    );
    
    try {
        logger.log(`[DEBUG] Connecting to server with transport: ${transport.constructor.name}`);
        await client.connect(transport);
        logger.log(`Successfully connected to server: ${params.serverName}`);
    } catch(e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logger.warn(`Failed to connect to server with error: ${errorMsg}`);
        logger.debug(`Transport parameters: ${JSON.stringify(transportParams, null, 2)}`);

        // Create a dummy client for empty/invalid configurations to prevent extension from crashing
        if (!params.command || params.command.trim() === '') {
            logger.warn('Empty or invalid command provided. Creating dummy client to prevent extension crash.');
            return new Client(
                {
                    name: params.serverName || 'dummy-client',
                    version: "0.0.1"
                },
                {
                    capabilities: {
                        prompts: true,
                        resources: true,
                        tools: true                        
                    }
                }
            );
        }

        throw new Error(`Failed to connect to server: ${errorMsg}`);
    }
    
    // Get the tools from the client with retry logic for slow-starting servers
    let tools: Tool[] = [];
    let retryCount = 0;
    const maxRetries = 5;  // Increased retries
    const retryDelay = 2000;  // Increased delay to 2 seconds
    
    const getToolsWithRetry = async (): Promise<Tool[]> => {
        try {
            logger.log(`[DEBUG] Attempting to get tools for server ${params.serverName} (attempt ${retryCount + 1}/${maxRetries})`);
            const toolsResponse = await client.listTools();
            
            logger.log(`[DEBUG] Raw tools response: ${JSON.stringify(toolsResponse)}`);
            
            if (toolsResponse.error) {
                logger.warn(`Error retrieving tools: ${toolsResponse.error}`);
                throw new Error(typeof toolsResponse.error === 'object' ? JSON.stringify(toolsResponse.error) : String(toolsResponse.error));
            }
            
            const retrievedTools = toolsResponse.tools || [];
            logger.log(`Retrieved ${retrievedTools.length} tools from server ${params.serverName}`);
            
            if (retrievedTools.length > 0) {
                logger.log(`[DEBUG] First tool: ${JSON.stringify(retrievedTools[0])}`);
            } else {
                logger.log(`[DEBUG] No tools returned from server ${params.serverName}`);
            }
            
            return retrievedTools;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.warn(`Failed to retrieve tools from client (attempt ${retryCount + 1}/${maxRetries}): ${errorMsg}`);
            
            if (retryCount < maxRetries) {
                retryCount++;
                logger.log(`Retrying tool retrieval in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return getToolsWithRetry();
            }
            
            logger.warn(`Max retries reached, continuing with empty tools list for ${params.serverName}`);
            return [];
        }
    };
    
    // Attempt to get tools with retry logic
    tools = await getToolsWithRetry();
    
    const toolManifest = tools.map(tool => ({
        "name": tool.name,
        "tags": ["mcpsx", params.serverName],
        "toolReferenceName": `${params.serverName.toLowerCase().replace(/\s+/g, '-')}.${tool.name}`,
        "displayName": replacePlaceholders(tool.name, params.serverName, params.allServerNames),
        "modelDescription": replacePlaceholders(tool.description || 'No description provided', params.serverName, params.allServerNames),
        "inputSchema": tool.inputSchema,
        "canBeReferencedInPrompt": true,
        "icon": "$(tools)",  // Updated icon
        "userDescription": replacePlaceholders(tool.description || 'No description provided', params.serverName, params.allServerNames)
    }));

    logger.log(`[DEBUG] Created tool manifest with ${toolManifest.length} tools`);

    // 2. Create a minimal package.json with a contributed command
    const manifest = {
        name: toolsExtTemplate(params.serverName),
        displayName: `mcpsx-run - ${params.serverName}`,
        description: `MCP Server: ${params.serverName} with tools and chat commands`,
        main: "extension.js",
        publisher: "jasonkneen",
        version: "1.0.0",
        engines: { vscode: "^1.80.0" },        
        repository: {
            type: "git",
            url: "https://github.com/jasonkneen/mcpsx"
        },
        activationEvents: ["onStartupFinished"],
        enableProposedApi: true,
        enabledApiProposals: [
            "extensionRuntime",
            "languageModels"  // Added language models API
        ],
        contributes: {
            languageModelTools: toolManifest,
            // Add chat participant configuration
            chatParticipants: [
                {
                    id: `mcpsx-run.studio.${params.serverName.toLowerCase().replace(/\s+/g, '-')}`,
                    name: `${params.chatParticipantName?.toLowerCase().replace(/\s+/g, '') || params.serverName.toLowerCase().replace(/\s+/g, '')}`,
                    description: `Chat participant for ${params.serverName} MCP server`,
                    commands: tools.map(tool => ({
                        name: tool.name,
                        description: tool.description || `Use ${tool.name} from ${params.serverName}`
                    })),
                    isSticky: params.isSticky,
                }
            ],
            // Add chat participant configuration
            configuration: {
                title: `MCP Server: ${params.serverName}`,
                properties: {
                    [`mcpsx.${params.serverName.toLowerCase().replace(/\s+/g, '-')}.displayName`]: {
                        type: "string", 
                        default: `@${params.chatParticipantName?.toLowerCase().replace(/\s+/g, '') || params.serverName.toLowerCase().replace(/\s+/g, '')}`,
                        description: `Chat reference name for ${params.serverName}`
                    }
                }
            },
            /* // Add commands for this server
            commands: [
                {
                    command: `mcpsx-run.studio.${params.serverName.toLowerCase().replace(/\s+/g, '-')}.list`,
                    title: `MCP: List ${params.serverName} Information`
                },
                {
                    command: `${toolsExtTemplate(params.serverName)}.openChat`,
                    title: `MCP: Open Chat for ${params.serverName}`,
                    category: "mcpsx-run"
                }
            ] */
        }
    };

    const vsixPath = path.join(extDir, `${manifest.name}-${manifest.version}.vsix`);
    logger.log(`[DEBUG] Creating VSIX at path: ${vsixPath}`);

    // Clean up existing VSIX files
    if(fs.existsSync(vsixPath)) {
        logger.log(`Removing existing VSIX file: ${vsixPath}`);
        fs.unlinkSync(vsixPath);
    }

    const files = fs.readdirSync(extDir);
    for (const file of files) {
        if (file.endsWith('.vsix')) {
            const filePath = path.join(extDir, file);
            logger.log(`Removing existing VSIX file: ${filePath}`);
            fs.unlinkSync(filePath);
        }
    }

    fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(extDir, 'extension.js'), `
        const vscode = require('vscode');

        /**
         * Activate the extension
         * @param {vscode.ExtensionContext} context
         */
        function activate(context) {
            console.log('MCP Server extension activated: ${params.serverName}');
            
            // Server information
            const serverName = '${params.serverName}';
            const serverSlug = '${params.serverName.toLowerCase().replace(/\s+/g, '-')}';
            const chatDisplayName = '${params.chatParticipantName || params.serverName}';
            const chatParticipantId = 'mcpsx-run.studio.${params.chatParticipantName?.toLowerCase().replace(/\s+/g, '-') || params.serverName.toLowerCase().replace(/\s+/g, '-')}';
            const serverToolNames = ${JSON.stringify(tools.map(tool => tool.name))};
            
            // Register the list command
            //context.subscriptions.push(
            //    vscode.commands.registerCommand(\`mcpsx-run.studio.\${serverSlug}.tools\`, async () => {
            //        vscode.window.showInformationMessage(\`Server: \${serverName}\`);
            //    })
           // );

            const chatCommands = [];
            
            // Add tool-specific commands
            // Create a unique prefix for this server's tools            
            
            serverToolNames.forEach(toolName => {
                chatCommands.push({
                    name: toolName, 
                    description: \`Use \${toolName} from \${serverName}\` // Include server name in description
                });
            });

            // Add a custom attribute to the window object to identify which server this extension belongs to
            console.log(\`Setting window.__mcpServerName = "\${serverName}"\`);

            // Log available chat commands
            console.log(\`Available chat commands for \${chatDisplayName} (server: \${serverName}):\`);
            chatCommands.forEach(cmd => {
                console.log(\`/\${cmd.name} - \${cmd.description} (Tool: \${serverSlug}.\${cmd.name})\`);
            });
            console.log(\`Chat reference: @\${chatDisplayName.toLowerCase().replace(/\\s+/g, '')}\`);
        }
        
        function deactivate() {}
        
        module.exports = { activate, deactivate };
    `);
    fs.writeFileSync(path.join(extDir, 'LICENSE'), 'MIT License');

    try {
        logger.log(`[DEBUG] Creating VSIX archive`);
        const output = fs.createWriteStream(vsixPath);
        const archive = archiver.create('zip', {
            zlib: { level: 9 }
        });

        output.on('close', function () {
            logger.log(`VSIX archive created: ${vsixPath} (${archive.pointer()} bytes)`);
        });

        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                logger.warn(`Archive warning: ${err}`);
            } else {
                throw err;
            }
        });

        archive.on('error', function (err) {
            throw err;
        });

        archive.pipe(output);

        archive.file(path.join(extDir, 'package.json'), { name: 'extension/package.json' });
        archive.file(path.join(extDir, 'extension.js'), { name: 'extension/extension.js' });
        archive.file(path.join(extDir, 'LICENSE'), { name: 'extension/LICENSE' });

        const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="json" ContentType="application/json"/>
    <Default Extension="js" ContentType="application/javascript"/>
    <Default Extension="md" ContentType="text/markdown"/>
    <Default Extension="txt" ContentType="text/plain"/>
    <Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>`;
        archive.append(contentTypesXml, { name: '[Content_Types].xml' });

        const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema/design">
    <Metadata>
        <Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}" />
        <DisplayName>${manifest.displayName}</DisplayName>
        <Description>${manifest.description}</Description>
        <Tags>mcp,studio,tools,extension</Tags>
    </Metadata>
    <Installation>
        <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
    </Installation>
    <Dependencies/>
    <Prerequisites>
        <Prerequisite Id="Microsoft.VisualStudio.Code" Version="^1.80.0" />
    </Prerequisites>
    <Assets>
        <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    </Assets>
</PackageManifest>`;
        archive.append(vsixManifest, { name: 'extension.vsixmanifest' });

        await archive.finalize();
        logger.log(`[DEBUG] Archive finalized`);
    } catch (error) {
        logger.error(`Failed to package extension: ${error}`);
        throw error;
    }

    if (!fs.existsSync(vsixPath)) {
        logger.error(`VSIX file does not exist at path: ${vsixPath}`);
        throw new Error(`Failed to create VSIX file at path: ${vsixPath}`);
    }

    logger.log(`[DEBUG] Installing VSIX from path: ${vsixPath}`);
    try {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsixPath));
        logger.log(`Successfully installed extension from ${vsixPath}`);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to install extension: ${errorMsg}`);
        throw error;
    }

    // Register the tools with VS Code
    logger.log(`[DEBUG] Registering ${tools.length} tools with VS Code`);
    await registerChatTools(params.context, tools, client, params.serverName, params.allServerNames);

    // Register commands for this server
    logger.log(`[DEBUG] Registering commands for server ${params.serverName}`);
    registerServerCommands(params.context, params.serverName, client);
    
    return client;
}

/**
 * Register chat commands for a specific server
 * @param context The extension context
 * @param serverName The server name
 * @param client The MCP client
 */
function registerServerCommands(context: vscode.ExtensionContext, serverName: string, client: Client) {
    const logger = Logger.getInstance();
    // Register commands for this server
    const serverSlug = serverName.toLowerCase().replace(/\s+/g, '-');
    const toolsCommandId = `mcpsx-run.studio.${serverSlug}.tools`;
    const chatParticipantId = `mcpsx-run.studio.${serverName.toLowerCase().replace(/\s+/g, '-')}`;
    const extName = toolsExtTemplate(serverName);

    // First, check if the command already exists
    try {
        // Try to get all registered commands
        const commandsPromise = vscode.commands.getCommands(true);
        commandsPromise.then(commands => {
            if (commands.includes(toolsCommandId)) {
                logger.log(`[COMMAND DEBUG] Command ${toolsCommandId} already exists, will be overwritten`);
            }
        });
        // Handle errors with a separate try-catch since PromiseLike doesn't have .catch
        commandsPromise.then(undefined, (error: unknown) => {
            logger.error(`[COMMAND DEBUG] Error checking for existing command: ${error instanceof Error ? error.message : String(error)}`);
        });
    } catch (error) {
        logger.error(`[COMMAND DEBUG] Error handling existing command: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Define the command handler
    const toolsCommandHandler = async () => {
        try {
            // Get tools for this server
            const toolsResponse = await client.listTools();
            const tools = toolsResponse.tools || [];

            if (tools.length === 0) {
                vscode.window.showInformationMessage(`No tools available for server: ${serverName}`);
                return;
            }

            // Show tools in a quick pick
            const toolItems = tools.map(tool => ({
                label: tool.name,
                description: tool.description || 'No description',
                detail: `Server: ${serverName}`
            }));

            vscode.window.showQuickPick(toolItems, {
                placeHolder: 'Select a tool to learn more'
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error listing tools: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    // Use try-catch when registering the command to handle potential errors
    try {
        const disposable = vscode.commands.registerCommand(toolsCommandId, toolsCommandHandler);
        context.subscriptions.push(disposable);
        logger.log(`[COMMAND DEBUG] Successfully registered command: ${toolsCommandId}`);
    } catch (error) {
        logger.error(`[COMMAND DEBUG] Failed to register command ${toolsCommandId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Register the chat participant activation command
    try {
        const chatCommandId = `${extName}.openChat`;
        const chatCommandHandler = async () => {
            try {
                // Open the chat view
                // Try different commands to open the chat view
                // Try multiple possible commands for opening the chat view
                const chatCommands = [
                    'workbench.action.chat.open',
                    'workbench.action.openChat',
                    'chat.focus'
                ];
                for (const cmd of chatCommands) {
                    try {
                        await vscode.commands.executeCommand(cmd);
                        // If we get here, the command succeeded
                        break;
                    } catch (e) {
                        logger.log(`Command ${cmd} failed: ${e}`);
                    }
                }
                vscode.window.showInformationMessage(`Opened chat view for ${serverName}`);
            } catch (error) {
                // Handle errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to open chat view: ${errorMessage}`);
            }
        };

        const chatDisposable = vscode.commands.registerCommand(chatCommandId, chatCommandHandler);
        context.subscriptions.push(chatDisposable);
        logger.log(`[COMMAND DEBUG] Successfully registered chat command: ${chatCommandId}`);
    } catch (error) {
        logger.error(`[COMMAND DEBUG] Failed to register chat command: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function registerChatTools(context: vscode.ExtensionContext, tools: Tool[], client: Client, serverName: string, allServerNames?: string[]) {
    const logger = Logger.getInstance();
    logger.log(`[DEBUG] Starting tool registration process for ${tools.length} tools`);
    logger.log(`[DEBUG] Registering tools for server: ${serverName}`);
    
    // Create a unique prefix for this server's tools
    const serverSlug = serverName.toLowerCase().replace(/\s+/g, '-');
    
    // Log all tools being registered
    logger.log(`[DEBUG] Tools to register: ${tools.map(t => t.name).join(', ')}`);
    
    // Initialize array for this server if it doesn't exist
    if (!serverToolsMap.has(serverName)) {
        serverToolsMap.set(serverName, []);
    }

    for(const tool of tools) {
        try {
            // Create a unique tool name with server prefix to avoid collisions
            const uniqueToolName = `${serverSlug}.${tool.name}`;
            logger.log(`[DEBUG] Registering tool: ${tool.name} as ${uniqueToolName} for server ${serverName}`);
            
            // Create the proxy tool with server information
            const vscodeTool = new McpProxyTool(client, tool, serverName, allServerNames);
            
            // Register the tool with VS Code
            const disposable = vscode.lm.registerTool(uniqueToolName, vscodeTool);
            context.subscriptions.push(disposable);
            
            // Store the disposable in our map for later cleanup
            serverToolsMap.get(serverName)?.push(disposable);
            
            logger.log(`[DEBUG] Successfully registered tool: ${tool.name}`);
        } catch (error) {
            logger.error(`Failed to register tool ${tool.name}: ${error}`);
            throw error; // Re-throw to handle at caller level
        }
    }
}

export async function uninstallToolsExtension(serverName: string) {
    const logger = Logger.getInstance();
    const extDir = path.join(findCacheDirectory({ name: 'mcpsx' }) ?? tmpdir(), toolsExtTemplate(serverName));
    const extensionId = toolsExtTemplate(serverName);
    logger.log(`[UNINSTALL DEBUG] Uninstalling tools extension for ${serverName}, extension ID: ${extensionId}`);
    
    try {
        // First try to remove the directory
        if (fs.existsSync(extDir)) {
            logger.log(`[UNINSTALL DEBUG] Removing extension directory: ${extDir}`);
            fs.rmSync(extDir, { recursive: true, force: true });
            logger.log(`[UNINSTALL DEBUG] Successfully removed extension directory: ${extDir}`);
        } else {
            logger.log(`[UNINSTALL DEBUG] Extension directory does not exist: ${extDir}`);
        }
        
        // Then try to uninstall the extension
        logger.log(`[UNINSTALL DEBUG] Executing uninstall command for extension ID: ${extensionId}`);
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extensionId);
        logger.log(`[UNINSTALL DEBUG] Successfully uninstalled extension for ${serverName}`);
    } catch (error) {
        logger.error(`[UNINSTALL DEBUG] Failed to uninstall extension: ${error}`);
        // Don't throw the error, just log it and continue
        // This allows the installation process to continue even if uninstallation fails
        // throw error;
    }
    
    // Return true to indicate completion (even if there were errors)
    return true;
}

/**
 * Unregister all tools for a specific server
 * @param serverName The name of the server whose tools should be unregistered
 * @returns void
 */
export function unregisterServerTools(serverName: string): void {
    const logger = Logger.getInstance();
    const disposables = serverToolsMap.get(serverName);
    if (!disposables || disposables.length === 0) {
        logger.log(`[DEBUG] No tools to unregister for server: ${serverName}`);
        return;
    }

    // Dispose each tool
    for (const disposable of disposables) {
        try {
            disposable.dispose();
            logger.log(`[DEBUG] Disposed tool for server: ${serverName}`);
        } catch (error) {
            logger.warn(`[DEBUG] Error disposing tool for server ${serverName}: ${error}`);
        }
    }

    // Clear the map entry
    serverToolsMap.delete(serverName);
    logger.log(`[DEBUG] Unregistered ${disposables.length} tools for server: ${serverName}`);
}
