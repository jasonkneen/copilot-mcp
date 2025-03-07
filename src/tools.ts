import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { CreateMessageRequestSchema, Implementation, ListRootsRequest, ListRootsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types';
import { Client, ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { findActualExecutable, spawnPromise } from 'spawn-rx';
import { McpProxyTool } from './tools/McpProxyTool';
import { Logger } from './utils/Logger';
import findCacheDirectory from 'find-cache-dir';
import * as vsce from '@vscode/vsce';
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


    // split the command into args
    const [command, ...pArguments] = params.command?.split(' ') || [];
    const { cmd: pCmd, args: pArgs } = findActualExecutable(command, pArguments);
    const env = { ...getDefaultEnvironment(), ...params.env, };
    const transportParams = {
        command: pCmd,
        args: pArgs,
        env: env,
        cwd: findCacheDirectory({ name: 'mcp-manager' }),
        stderr: "pipe" as const
    };
    let transport: Transport;
    // 2. create a client and transport
    if (params.transport === 'stdio' || !params.transport) {

        try {
            transport = new StdioClientTransport(transportParams);
            transport.onclose = () => {
                logger.warn(`Transport closed`);
            };
            transport.onerror = (e) => {
                logger.warn(`Transport error: ${e}`);
            };
            transport.onmessage = (message) => {
                // logger.log(`Transport message: ${message}`);
            };
            // await transport.close();
            // await transport.start();
        } catch (e) {
            logger.warn(`Failed to create stdio transport: ${e}`);
            throw new Error(`Failed to create stdio transport: ${e}`);
        }
    } else if (params.transport === 'sse') {
        if (!params.url) {
            throw new Error('URL is required for SSE transport');
        }
        transport = new SSEClientTransport(new URL(params.url));
    } else {
        logger.warn(`Unsupported transport: ${params.transport}`);
        throw new Error(`Unsupported transport: ${params.transport}`);
    }

    // 3. create a client
    const client = new NamedClient(
        {
            name: params.serverName,
            version: "0.0.0",
            command: params.command || ""
        },
        {
            capabilities: {
                prompts: {},
                resources: {},
                tools: {},
                roots: {
                    'listChanged': true
                },
                sampling: {

                }
            },

        },

    );

    try {
        await client.connect(transport);
    } catch (e) {
        logger.log(`Failed to connect to server with error: ${e}\n${JSON.stringify(transportParams)}`);
        throw new Error(`Failed to connect to server: ${e}`);
    }

    client.setRequestHandler(CreateMessageRequestSchema, async (samplingRequest) => {
        const messages: vscode.LanguageModelChatMessage[] = samplingRequest.params.messages.map(message => vscode.LanguageModelChatMessage.User(message.content.text as string));
        // We need to query the chat LLM with the request

        const defaultSamplingPrompt = `You are a helpful assistant.`;
        const [model] = await vscode.lm.selectChatModels({ 'vendor': 'copilot', 'family': "claude-3.5-sonnet" });
        const chatResult = await model.sendRequest(messages, { 'justification': samplingRequest.params.systemPrompt ?? defaultSamplingPrompt });
        let accumulatedResponse = '';

        for await (const fragment of chatResult.text) {
            accumulatedResponse += fragment;
        }
        return {
            'model': model.name,
            'role': 'user',
            'content': {
                'type': 'text',
                'text': accumulatedResponse
            }
        };
    });

    // Set the request handler for the ListRootsRequest
    client.setRequestHandler(ListRootsRequestSchema, async () => {
        const root = vscode.workspace.workspaceFolders?.[0].uri || vscode.workspace.rootPath;
        if (!root) {
            return {
                roots: []
            };
        }
        return {
            roots: [
                {
                    uri: root,
                    name: 'working_directory',
                    type: 'directory'
                }
            ]
        };
    });
    console.log('Initializing tools for server: ');
    // Get the tools from the client
    const toolsResponse = await client.listTools();
    if (toolsResponse.error) {
        throw new Error(`Failed to get tools: ${toolsResponse.error}`);
    }
    const tools = toolsResponse.tools;
    // register the tools with vscode lm api


    return client;
}

export function registerChatTools(context: vscode.ExtensionContext, tools: Tool[], client: NamedClient) {
    for (const tool of tools) {
        const vscodeTool: vscode.LanguageModelTool<typeof tool['inputSchema']> = new McpProxyTool(client, tool);
        console.log(`Registering tool: ${tool.name}`);
        const disposable = vscode.lm.registerTool(tool.name, vscodeTool);
        context.subscriptions.push(disposable);
        console.log(`Registered tool: ${tool.name}`);
    }
}

export async function createToolsExtension(clients: NamedClient[], context: vscode.ExtensionContext) {
    const extDir = findCacheDirectory({ name: 'mcp-manager', create: true, cwd: context.extensionPath });
    Logger.getInstance().log(`Extension directory: ${extDir}`);
    if (!extDir) {
        throw new Error('Failed to create extension directory');
    }
    fs.mkdirSync(extDir, { recursive: true });

    // First collect all tool responses and map them to the client name
    const toolResponses = await Promise.all(clients.map(async (client, index) => {
        const response = await client.listTools();
        return {
            client: clients[index],
            tools: response.tools
        };
    }));

    // Then extract and flatten the tools arrays
    const tools = toolResponses.flatMap(response => {
        return response.tools.map(tool => ({
            ...tool,
            client: response.client
        }));
    });

    const toolManifest = tools.map(tool => ({
        "name": tool.name,
        "tags": ["mcpManager", tool.client.name],
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
        name: 'mcp-manager-tools-ext',
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

    fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify(manifest, null, 2));
    // 3. Provide an empty extension entry point (required for VSIX packaging) and empty LICENSE file
    fs.writeFileSync(path.join(extDir, 'extension.js'), `exports.activate = function() {}; exports.deactivate = function() {};`);
    fs.writeFileSync(path.join(extDir, 'LICENSE'), '');

    // 4. Package the extension into a VSIX using the vsce API directly
    try {
        await vsce.createVSIX({
            cwd: extDir,
            allowMissingRepository: true,
            allowStarActivation: true
        });
    } catch (err) {
        Logger.getInstance().warn(`Failed to package extension: ${err instanceof Error ? err.message : String(err)}`);
        throw new Error(`Failed to package extension: ${err instanceof Error ? err.message : String(err)}`);
    }
    // This produces dynamic-cmd-ext-0.0.1.vsix in the extDir.

    // 5. Install the VSIX using VS Code's CLI or API:
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(`${extDir}/${manifest.name}-${manifest.version}.vsix`));
    toolResponses.forEach(response => {
        registerChatTools(context, response.tools, response.client);
    });

}

// method to uninstall the tools extension
export async function uninstallToolsExtension(serverName: string) {
    const extDir = path.join(tmpdir(), toolsExtTemplate(serverName));
    fs.rmSync(extDir, { recursive: true, force: true });
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', toolsExtTemplate(serverName));
}

export class NamedClient extends Client {
    protected _name: string;
    protected _command: string;

    constructor(info: Implementation & { command: string }, options: ClientOptions) {
        super(info, options);
        this._name = info.name;
        this._command = info.command as string;
    }

    public get name() {
        return this._name;
    }
    public set name(name: string) {
        this._name = name;
    }
    public get command() {
        return this._command;
    }
    public set command(command: string) {
        this._command = command;
    }
}