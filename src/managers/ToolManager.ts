import * as vscode from 'vscode';
import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index";
import { Tool } from "@modelcontextprotocol/sdk/types";
import { McpProxyTool } from '../tools/McpProxyTool';

/**
 * ToolManager handles registration and management of MCP tools
 */
export class ToolManager {
    private _toolRegistrations: Map<string, vscode.Disposable[]> = new Map();
    private _toolInstances: vscode.LanguageModelChatTool[] = [];
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    /**
     * Register tools from an MCP client
     * @param serverId The server ID
     * @param client The MCP client
     * @param tools The tools to register
     * @returns A promise that resolves when the tools are registered
     */
    public async registerTools(serverId: string, client: MCPClient, tools: Tool[]): Promise<void> {
        try {
            const registrations: vscode.Disposable[] = [];
            const toolInstances: vscode.LanguageModelChatTool[] = [];

            // Create a Set of existing tool names to prevent duplicates
            const existingToolNames = new Set(this._toolInstances.map(tool => tool.name));

            for (const tool of tools) {
                try {
                    console.log(`Registering tool: ${tool.name}`);
                    
                    if (!tool.name) {
                        console.log('Tool missing name, skipping');
                        continue;
                    }

                    // Skip if tool is already registered
                    if (existingToolNames.has(tool.name)) {
                        console.log(`Tool ${tool.name} already registered, skipping`);
                        continue;
                    }

                    // Create the tool proxy
                    const chatTool = new McpProxyTool(client, tool);
                    
                    // Register the tool with VS Code
                    const registration = vscode.lm.registerTool(tool.name, chatTool);
                    
                    registrations.push(registration);
                    toolInstances.push(chatTool);
                    existingToolNames.add(tool.name);
                    
                    console.log(`Registered tool: ${tool.name}`);
                } catch (error) {
                    console.error(`Register Tool ${tool.name} error:`, error);
                }
            }

            if (registrations.length > 0) {
                // Store registrations for cleanup
                this._toolRegistrations.set(serverId, registrations);
                
                // Filter out any existing tools with the same names before adding new ones
                this._toolInstances = [
                    ...this._toolInstances.filter(t => !toolInstances.some(newTool => newTool.name === t.name)),
                    ...toolInstances
                ];
                
                // Add to extension subscriptions for cleanup
                this._context.subscriptions.push(...registrations);
                
                // Tools registered successfully
                console.log(`Registered ${registrations.length} tools for server ${serverId}`);
            }
        } catch (error) {
            console.error(`Register Tools for Server ${serverId} error:`, error);
            throw error;
        }
    }

    /**
     * Unregister tools for a server
     * @param serverId The server ID
     */
    public unregisterTools(serverId: string): void {
        try {
            const registrations = this._toolRegistrations.get(serverId);
            if (registrations) {
                // Dispose all tool registrations
                registrations.forEach(registration => registration.dispose());
                this._toolRegistrations.delete(serverId);
                
                // Remove the unregistered tools from _toolInstances
                const serverTools = this._getToolsForServer(serverId);
                const toolNamesToRemove = new Set(serverTools.map(t => t.name));
                this._toolInstances = this._toolInstances.filter(t => !toolNamesToRemove.has(t.name));
                
                console.log(`Unregistered ${registrations.length} tools for server ${serverId}`);
            }
        } catch (error) {
            console.error(`Unregister Tools for Server ${serverId} error:`, error);
        }
    }

    /**
     * Get all registered tools
     * @returns An array of registered tools
     */
    public getAllTools(): vscode.LanguageModelChatTool[] {
        return this._toolInstances;
    }
    
    /**
     * Get tools for a specific server
     * @param serverId The server ID
     * @returns An array of tools for the server
     */
    private _getToolsForServer(serverId: string): vscode.LanguageModelChatTool[] {
        // This would normally look up tools associated with a server,
        // but for simplicity we're just returning all tools
        return this._toolInstances;
    }
    
    /**
     * Refresh tools for a server
     * @param serverId The server ID
     * @param client The MCP client
     * @param tools The updated tools
     */
    public async refreshToolsForServer(serverId: string, client: MCPClient, tools: Tool[]): Promise<void> {
        try {
            // First unregister existing tools
            this.unregisterTools(serverId);
            
            // Register the updated tools
            await this.registerTools(serverId, client, tools);
            
            console.log(`Refreshed tools for server ${serverId}: ${tools.length} tools`);
        } catch (error) {
            console.error(`Refresh Tools for Server ${serverId} error:`, error);
        }
    }
    
    /**
     * Dispose all resources
     */
    public dispose(): void {
        try {
            // Dispose all tool registrations
            for (const [serverId, registrations] of this._toolRegistrations.entries()) {
                for (const registration of registrations) {
                    registration.dispose();
                }
                console.log(`Disposed ${registrations.length} tools for server ${serverId}`);
            }
            
            this._toolRegistrations.clear();
            this._toolInstances = [];
            
            console.log('Tool manager disposed');
        } catch (error) {
            console.error('Dispose Tool Manager error:', error);
        }
    }
}