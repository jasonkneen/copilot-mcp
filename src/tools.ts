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
export interface RegisterToolsParams {
    context: vscode.ExtensionContext;
    serverName: string;
    command?: string;
    env?: {
        [key: string]: string;
    }
    transport?: 'stdio' | 'sse';
    url?: string;
}

export const toolsExtTemplate = (serverName: string) => `mcpManager-${serverName}-tools-ext`;


export async function installDynamicToolsExt(params: RegisterToolsParams) {
    const logger = Logger.getInstance();
    // 1. Prepare a temporary extension directory
    const extDir = path.join(findCacheDirectory({name: 'mcp-manager'}) ?? tmpdir(), toolsExtTemplate(params.serverName));
    logger.log(`Extension directory: ${extDir}`);
    fs.mkdirSync(extDir, { recursive: true });

    // split the command into args
    const [command, ...pArguments] = params.command?.split(' ') || [];
    const {cmd: pCmd, args: pArgs} = findActualExecutable(command, pArguments);
    const env = {...params.env, ...getDefaultEnvironment() };
    const transportParams = {
        command: pCmd,
        args: pArgs,
        env: env,
        cwd: findCacheDirectory({name: 'mcp-manager'})
    };
    let transport: Transport;
    // 2. create a client and transport
    if(params.transport === 'stdio' || !params.transport) {
        
        try {
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
            // await transport.close();
            // await transport.start();
        } catch(e) {
            logger.warn(`Failed to create stdio transport: ${e}`);
            throw new Error(`Failed to create stdio transport: ${e}`);
        }
    } else if(params.transport === 'sse') {
        if(!params.url) {
            throw new Error('URL is required for SSE transport');
        }
        transport = new SSEClientTransport(new URL(params.url));
    } else {
        logger.warn(`Unsupported transport: ${params.transport}`);
        throw new Error(`Unsupported transport: ${params.transport}`);
    }

    // 3. create a client
    const client = new Client(
        {
          name: params.serverName,
          version: "0.0.0"
        },
        {
          capabilities: {
            prompts: {},
            resources: {},
            tools: {}
          }
        }
    );
    try {
        await client.connect(transport);
    } catch(e) {
        logger.warn(`Failed to connect to client with error: ${e}\n${JSON.stringify(transportParams)}`);
        throw new Error(`Failed to connect to client: ${e}`);
    }

    // Get the tools from the client
    const toolsResponse = await client.listTools();
    if(toolsResponse.error) {
        throw new Error(`Failed to get tools: ${toolsResponse.error}`);
    }
    const tools = toolsResponse.tools;
    
    const toolManifest = tools.map(tool => ({
        "name": tool.name,
        "tags": ["mcpManager", params.serverName],
        "toolReferenceName": tool.name,
        "displayName": tool.name,
        "modelDescription": tool.description,
        "inputSchema": tool.inputSchema,
        "canBeReferencedInPrompt": true,
        "icon": "$(note)",
        "userDescription": tool.description
    }));

    // 2. Create a minimal package.json with a contributed command
    const manifest = {
        name: toolsExtTemplate(params.serverName),
        main: "extension.js",
        publisher: "AutomataLabs",           // (Use your publisher ID if publishing)
        version: "0.0.1",
        engines: { vscode: "^1.97.0" },
        activationEvents: ["*"],            // activate on startup (or specify specific event)
        contributes: {
            languageModelTools: [
                ...toolManifest
            ]
        }
    };
    // check if package/vsix exists
    const vsixPath = path.join(extDir, `${manifest.name}-${manifest.version}.vsix`);
    console.log(vsixPath);
    if(fs.existsSync(vsixPath)) {
        fs.unlinkSync(vsixPath);
    }
    fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify(manifest, null, 2));

    // 3. Provide an empty extension entry point (required for VSIX packaging) and empty LICENSE file
    fs.writeFileSync(path.join(extDir, 'extension.js'), `exports.activate = function() {}; exports.deactivate = function() {};`);
    fs.writeFileSync(path.join(extDir, 'LICENSE'), '');

    // 4. Package the extension into a VSIX (using vsce or a zip utility).
    // For brevity, we'll assume vsce is available and use child_process to run it:
    const {args, cmd} = findActualExecutable('npx', ['-y', '@vscode/vsce', 'package', '--allow-missing-repository', '--allow-star-activation']);
    const packageRes = await spawnPromise(cmd, args, { cwd: extDir, stdio: 'inherit' }).catch(e => e);
    if(packageRes instanceof Error) {
        logger.warn(`Failed to package extension: ${packageRes.message}`);
        debugger;
        throw new Error(`Failed to package extension: ${packageRes.message}`);
    }
    logger.log(packageRes);
    // This produces dynamic-cmd-ext-0.0.1.vsix in the extDir.

    // 5. Install the VSIX using VS Code's CLI or API:
    // const vsixPath = path.join(extDir, `${manifest.name}-${manifest.version}.vsix`);
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsixPath));

    // register the tools with vscode lm api
    registerChatTools(params.context, tools, client);
    return client;
}

export function registerChatTools(context: vscode.ExtensionContext, tools: Tool[], client: Client) {
    for(const tool of tools) {
        const vscodeTool: vscode.LanguageModelTool<typeof tool['inputSchema']> = new McpProxyTool(client, tool);
        context.subscriptions.push(
            vscode.lm.registerTool(tool.name, vscodeTool)
        );
    }
}

// method to uninstall the tools extension
export async function uninstallToolsExtension(serverName: string) {
    const extDir = path.join(tmpdir(), toolsExtTemplate(serverName));
    fs.rmSync(extDir, { recursive: true, force: true });
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', toolsExtTemplate(serverName));
}