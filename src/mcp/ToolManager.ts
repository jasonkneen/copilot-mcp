import * as vscode from 'vscode';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types';
import { MCPClientWrapper } from './MCPClientWrapper';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { ServerEventType, ServerEvent } from '../server/ServerConfig';
import { EventBus } from '../utils/EventBus';

/**
 * Proxy tool that bridges VS Code's Chat Tool API and MCP tools
 */
class MCPProxyTool implements vscode.LanguageModelChatTool {
    /**
     * Creates a new proxy tool
     * @param mcpClient The MCP client to call the tool with
     * @param tool The MCP tool definition
     */
    constructor(
        private readonly mcpClient: MCPClientWrapper,
        private readonly tool: Tool
    ) { }

    // Properties required by VS Code's LanguageModelChatTool interface
    public readonly name: string = this.tool.name;
    public readonly description: string = this.tool.description || '';
    public readonly inputSchema: Tool['inputSchema'] = this.tool.inputSchema;

    /**
     * Prepares for tool invocation
     * @param options Tool invocation options
     * @returns Messages to display before/after invocation
     */
    async prepareInvocation(options: vscode.LanguageModelToolInvocationOptions<any>): Promise<{ confirmationMessage?: string; invocationMessage?: string }> {
        return {
            confirmationMessage: `Allow tool "${this.tool.name}" to run?`,
            invocationMessage: `Running tool "${this.tool.name}"...`
        };
    }

    /**
     * Invokes the MCP tool
     * @param options Tool invocation options
     * @param token Cancellation token
     * @returns Tool execution result
     */
    async invoke(options: vscode.LanguageModelToolInvocationOptions<any>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
        try {
            // Define the payload
            const payload: CallToolRequest["params"] = {
                name: this.tool.name,
                arguments: options.input
            };

            // Call the MCP tool
            const result = await this.mcpClient.callTool(payload);

            // Convert MCP result to LanguageModelToolResult
            let content: (vscode.LanguageModelTextPart | vscode.LanguageModelPromptTsxPart)[] = [];

            if (result.content && Array.isArray(result.content)) {
                for (const item of result.content) {
                    if (item.type === 'text' && typeof item.text === 'string') {
                        content.push(new vscode.LanguageModelTextPart(item.text));
                    }
                }
            } else if (typeof result === 'string') {
                content.push(new vscode.LanguageModelTextPart(result));
            } else if (result.text || result.result) {
                const text = result.text || result.result;
                if (typeof text === 'string') {
                    content.push(new vscode.LanguageModelTextPart(text));
                } else if (typeof text === 'object') {
                    content.push(new vscode.LanguageModelTextPart(JSON.stringify(text, null, 2)));
                }
            }

            // Fallback if no content was extracted
            if (content.length === 0) {
                content.push(new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2)));
            }

            return new vscode.LanguageModelToolResult(content);
        } catch (error) {
            ErrorHandler.handleError(`Tool Invocation: ${this.tool.name}`, error);
            throw new Error(`Tool "${this.tool.name}" failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

/**
 * Manages tool registration and invocation with VS Code
 */
export class ToolManager {
    private _toolRegistrations: Map<string, vscode.Disposable[]> = new Map();
    private _toolInstances: vscode.LanguageModelChatTool[] = [];
    private _logger?: Logger;

    /**
     * Creates a new tool manager
     * @param context The extension context
     */
    constructor(private readonly context: vscode.ExtensionContext) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }

        // Subscribe to server events
        this._setupEventListeners();
    }

    /**
     * Set up event listeners for server events
     */
    private _setupEventListeners(): void {
        // Listen for tool changes
        const toolsChangedSubscription = EventBus.onEvent(event => {
            if (event.type === ServerEventType.TOOLS_CHANGED) {
                if (this._logger) {
                    this._logger.log(`Tools changed for server ${event.serverId}, updating tool registrations`);
                }
                this._handleToolsChanged(event);
            }
        });

        // Listen for server stopped events to clean up tools
        const serverStoppedSubscription = EventBus.onEvent(event => {
            if (event.type === ServerEventType.SERVER_STOPPED) {
                if (this._logger) {
                    this._logger.log(`Server ${event.serverId} stopped, unregistering tools`);
                }
                this.unregisterTools(event.serverId);
            }
        });

        // Add subscriptions to the extension context for proper disposal
        this.context.subscriptions.push(toolsChangedSubscription, serverStoppedSubscription);
    }

    /**
     * Handle tools changed event
     * @param event The tools changed event
     */
    private async _handleToolsChanged(event: ServerEvent): Promise<void> {
        if (!event.data?.tools || !Array.isArray(event.data.tools)) {
            return;
        }

        const tools = event.data.tools as Tool[];
        const mcpClient = event.data.mcpClient as MCPClientWrapper;

        if (mcpClient) {
            await this.registerTools(event.serverId, mcpClient, tools);
        }
    }

    /**
     * Register tools with VS Code
     * @param serverId The server ID
     * @param mcpClient The MCP client
     * @param tools The tools to register
     */
    public async registerTools(serverId: string, mcpClient: MCPClientWrapper, tools: Tool[]): Promise<void> {
        // Unregister any existing tools for this server
        await this.unregisterTools(serverId);

        const registrations: vscode.Disposable[] = [];
        const toolInstances: vscode.LanguageModelChatTool[] = [];

        // Create a Set of existing tool names to prevent duplicates
        const existingToolNames = new Set(this._toolInstances.map(tool => tool.name));

        for (const tool of tools) {
            try {
                if (this._logger) {
                    this._logger.log(`Registering tool: ${tool.name}`);
                }

                if (!tool.name) {
                    if (this._logger) {
                        this._logger.warn('Tool missing name, skipping');
                    }
                    continue;
                }

                // Skip if tool is already registered
                if (existingToolNames.has(tool.name)) {
                    if (this._logger) {
                        this._logger.log(`Tool ${tool.name} already registered, skipping`);
                    }
                    continue;
                }

                // Create proxy tool
                const chatTool = new MCPProxyTool(mcpClient, tool);

                // Register tool with VS Code
                const registration = vscode.lm.registerTool(tool.name, chatTool);
                registrations.push(registration);
                toolInstances.push(chatTool);
                existingToolNames.add(tool.name);

                if (this._logger) {
                    this._logger.log(`Registered tool: ${tool.name}`);
                }
            } catch (error) {
                ErrorHandler.handleError(`Register Tool: ${tool.name}`, error);
            }
        }

        if (registrations.length > 0) {
            this._toolRegistrations.set(serverId, registrations);

            // Filter out any existing tools with the same names before adding new ones
            this._toolInstances = [
                ...this._toolInstances.filter(t => !toolInstances.some(newTool => newTool.name === t.name)),
                ...toolInstances
            ];

            // Add to extension subscriptions for cleanup
            this.context.subscriptions.push(...registrations);

            if (this._logger) {
                this._logger.log(`Registered ${registrations.length} tools for server ${serverId}`);
            }
        }
    }

    /**
     * Unregister tools for a server
     * @param serverId The server ID
     */
    public async unregisterTools(serverId: string): Promise<void> {
        const registrations = this._toolRegistrations.get(serverId);
        if (registrations) {
            // Dispose all registrations
            for (const registration of registrations) {
                registration.dispose();
            }

            this._toolRegistrations.delete(serverId);

            // Remove the unregistered tools from _toolInstances
            const toolNames = new Set(
                registrations.map(r => (r as any)._tool?.name).filter(Boolean)
            );

            this._toolInstances = this._toolInstances.filter(t => !toolNames.has(t.name));

            if (this._logger) {
                this._logger.log(`Unregistered ${registrations.length} tools for server ${serverId}`);
            }
        }
    }

    /**
     * Get all registered tools
     * @returns Array of registered tools
     */
    public getAllTools(): vscode.LanguageModelChatTool[] {
        return [...this._toolInstances];
    }

    /**
     * Dispose and clean up resources
     */
    public dispose(): void {
        // Unregister all tools
        for (const [serverId, registrations] of this._toolRegistrations.entries()) {
            for (const registration of registrations) {
                registration.dispose();
            }
        }

        this._toolRegistrations.clear();
        this._toolInstances = [];

        if (this._logger) {
            this._logger.log('Tool manager disposed');
        }
    }
} 