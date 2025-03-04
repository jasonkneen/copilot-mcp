import * as vscode from 'vscode';
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index";
import { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types";
import { Logger } from '../utils/Logger';

/**
 * A proxy tool that forwards calls to an MCP tool
 */
export class McpProxyTool implements vscode.LanguageModelChatTool {
    private _client: MCPClient;
    private _tool: Tool;
    private logger: Logger;
    private _serverName: string;
    private _allServerNames?: string[];
    public name: string;
    public inputSchema: Tool['inputSchema'];
    public description: string;
    public tags: string[];

    constructor(client: MCPClient, tool: Tool, serverName?: string, allServerNames?: string[]) {
        this._client = client;
        this._tool = tool;
        this._serverName = serverName || client.getServerVersion()?.name || 'unknown';
        this._allServerNames = allServerNames;
        this.name = tool.name;
        this.inputSchema = tool.inputSchema;
        this.description = tool.description || '';
        // Add tags to identify which server this tool belongs to
        this.tags = ['mcpsx', this._serverName];
        this.logger = Logger.getInstance();

        this.logger.log(`[DEBUG] Created McpProxyTool for ${this.name} (server: ${this._serverName})`);
        this.logger.log(`[DEBUG] Tool schema: ${JSON.stringify(this.inputSchema)}`);
        
        // Log the server and tool information for debugging
        console.log(`[TOOL DEBUG] Registered tool ${this.name} for server ${this._serverName}`);
        console.log(`[TOOL DEBUG] Tool tags: ${this.tags.join(', ')}`);
    }

    private _handleNotification(notification: any): Promise<void> {
        this.logger.log(`[DEBUG] Received notification: ${JSON.stringify(notification)}`);
        return Promise.resolve();
    }

    async prepareInvocation(options: vscode.LanguageModelToolInvocationOptions<any>): Promise<{ confirmationMessage?: string; invocationMessage?: string }> {
        this.logger.log(`[DEBUG] Preparing invocation for tool ${this.name}`);
        this.logger.log(`[DEBUG] Invocation options: ${JSON.stringify(options)}`);
        this.logger.log(`[DEBUG] Tool server: ${this._serverName}`);

        return {
            confirmationMessage: `Allow tool "${this._tool.name}" to run?`,
            invocationMessage: `Running tool "${this._tool.name}"...`
        };
    }

    async invoke(options: vscode.LanguageModelToolInvocationOptions<any>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
        this.logger.log(`[DEBUG] Invoking tool: ${this.name}`);
        this.logger.log(`[DEBUG] Server: ${this._serverName}`);
        this.logger.log(`[DEBUG] Tool input: ${JSON.stringify(options.input)}`);
        
        // Process input to replace placeholders
        const processedInput = this._processInput(options.input);
        
        try {
            const payload: CallToolRequest["params"] = {
                name: this._tool.name,
                arguments: processedInput
            };
            
            this.logger.log(`[DEBUG] Sending payload: ${JSON.stringify(payload)}`);
            const result = await this._client.callTool(payload);
            this.logger.log(`[DEBUG] Tool result: ${JSON.stringify(result)}`);

            if (result.error) {
                throw new Error(`Tool execution error: ${JSON.stringify(result.error)}`);
            }

            // Convert MCP result to LanguageModelToolResult
            let content: (vscode.LanguageModelTextPart | vscode.LanguageModelPromptTsxPart)[] = [];
            
            if (Array.isArray(result.content)) {
                for (const item of result.content) {
                    if (item.type === 'text' && typeof item.text === 'string') {
                        content.push(new vscode.LanguageModelTextPart(item.text));
                    }
                }
            } else if (result.content) {
                // Handle single content item
                content.push(new vscode.LanguageModelTextPart(String(result.content)));
            }

            if (content.length === 0) {
                content.push(new vscode.LanguageModelTextPart('Tool executed successfully but returned no content.'));
            }

            return new vscode.LanguageModelToolResult(content);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Tool invocation error for ${this.name}: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                this.logger.debug(`Error stack: ${error.stack}`);
            }
            throw new Error(`Tool "${this._tool.name}" failed: ${errorMessage}`);
        }
    }
    
    /**
     * Process input arguments to replace placeholders
     * @param input The input arguments
     * @returns The processed input with placeholders replaced
     */
    private _processInput(input: any): any {
        if (!input) { return input; }
        
        // Define placeholders and their replacements
        const placeholders: Record<string, string> = {};
        
        // Add standard references
        placeholders['@mcp'] = 'MCP';
        placeholders['@mcps'] = 'MCP Servers';
        placeholders['@tool'] = 'Tool';
        placeholders['@tools'] = 'Tools';
        
        // Add the current server as a placeholder
        const serverPlaceholder = `@${this._serverName.toLowerCase().replace(/\s+/g, '')}`;
        placeholders[serverPlaceholder] = this._serverName;
        
        // Add all other servers as placeholders if provided
        if (this._allServerNames && Array.isArray(this._allServerNames)) {
            for (const name of this._allServerNames) {
                // Only add if not the current server (already added above)
                if (name !== this._serverName) {
                    const placeholder = `@${name.toLowerCase().replace(/\s+/g, '')}`;
                    placeholders[placeholder] = name;
                }
            }
        }
        
        // Helper function to replace placeholders in strings
        const replacePlaceholders = (text: string): string => {
            if (typeof text !== 'string') { return text; }
            
            let result = text;
            for (const [placeholder, value] of Object.entries(placeholders)) {
                result = result.replace(new RegExp(placeholder + '\\b', 'g'), value);
            }
            return result;
        };
        
        // Process different types of input
        if (typeof input === 'string') {
            return replacePlaceholders(input);
        } else if (Array.isArray(input)) {
            return input.map(item => this._processInput(item));
        } else if (typeof input === 'object' && input !== null) {
            const result: Record<string, any> = {};
            for (const [key, value] of Object.entries(input)) {
                result[key] = this._processInput(value);
            }
            return result;
        }
        
        return input;
    }
}