import * as vscode from 'vscode';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
    Tool
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/Logger';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * McpServer class that implements an MCP server using stdio transport
 * This server exposes the tools from all connected MCP clients
 */
export class McpServer {
    private server: Server;
    private logger: Logger;
    private isRunning: boolean = false;
    private clients: Map<string, Client> = new Map();

    constructor() {
        this.logger = Logger.getInstance();
        
        // Initialize the MCP server with tools capability only
        this.server = new Server(
            {
                name: 'copilot-mcpsx-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {}
                },
            }
        );

        // Set up error handling
        this.server.onerror = (error) => {
            this.logger.error(`[MCP Server] Error: ${error}`);
        };

        // Register request handlers
        this.setupRequestHandlers();
    }

    /**
     * Set up the request handlers for the MCP server
     */
    private setupRequestHandlers(): void {
        // Handler for listing tools from all connected clients
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            this.logger.log('[MCP Server] Handling ListTools request');
            
            // Collect tools from all clients
            const allTools: Tool[] = [];
            
            for (const [clientId, client] of this.clients.entries()) {
                try {
                    const toolsResponse = await client.listTools();
                    if (toolsResponse.tools && toolsResponse.tools.length > 0) {
                        // Add a prefix to each tool name to avoid conflicts
                        const prefixedTools = toolsResponse.tools.map(tool => ({
                            ...tool,
                            name: `${clientId}_${tool.name}`,
                            description: `[${clientId}] ${tool.description || 'No description'}`
                        }));
                        
                        allTools.push(...prefixedTools);
                        this.logger.log(`[MCP Server] Added ${prefixedTools.length} tools from client ${clientId}`);
                    }
                } catch (error) {
                    this.logger.warn(`[MCP Server] Error fetching tools from client ${clientId}: ${error}`);
                }
            }
            
            this.logger.log(`[MCP Server] Returning ${allTools.length} tools in total`);
            return { tools: allTools };
        });

        // Handler for calling tools by forwarding to the appropriate client
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const toolName = request.params.name;
            this.logger.log(`[MCP Server] Handling CallTool request for tool: ${toolName}`);
            
            // Extract client ID and original tool name from the prefixed tool name
            const parts = toolName.split('_');
            if (parts.length < 2) {
                this.logger.error(`[MCP Server] Invalid tool name format: ${toolName}`);
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Invalid tool name format: ${toolName}`
                );
            }
            
            const clientId = parts[0];
            const originalToolName = parts.slice(1).join('_');
            
            // Find the client
            const client = this.clients.get(clientId);
            if (!client) {
                this.logger.error(`[MCP Server] Client not found: ${clientId}`);
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Client not found: ${clientId}`
                );
            }
            
            try {
                this.logger.log(`[MCP Server] Forwarding tool call to client ${clientId} for tool ${originalToolName}`);
                
                // Forward the tool call to the original client
                // Use the same approach as in McpProxyTool.ts
                const payload = {
                    name: originalToolName,
                    arguments: request.params.arguments
                };
                
                this.logger.log(`[MCP Server] Sending payload: ${JSON.stringify(payload)}`);
                
                // Call the tool
                const result = await client.callTool(payload);
                
                if (result.error) {
                    this.logger.error(`[MCP Server] Error from client ${clientId}: ${JSON.stringify(result.error)}`);
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Error from client ${clientId}: ${JSON.stringify(result.error)}`
                    );
                }
                
                this.logger.log(`[MCP Server] Tool execution successful: ${originalToolName}`);
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`[MCP Server] Tool execution error: ${errorMessage}`);
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing tool: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    /**
     * Register a client with the MCP server
     * @param clientId The ID of the client
     * @param client The MCP client
     */
    public registerClient(clientId: string, client: Client): void {
        this.logger.log(`[MCP Server] Registering client: ${clientId}`);
        this.clients.set(clientId, client);
    }

    /**
     * Unregister a client from the MCP server
     * @param clientId The ID of the client
     */
    public unregisterClient(clientId: string): void {
        this.logger.log(`[MCP Server] Unregistering client: ${clientId}`);
        this.clients.delete(clientId);
    }

    /**
     * Start the MCP server
     */
    public async start(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('[MCP Server] Server is already running');
            return;
        }
        
        try {
            this.logger.log(`[MCP Server] Starting server...`);
            
            // Create a stdio transport for the server
            const transport = new StdioServerTransport();
            
            // Connect the server to the transport
            await this.server.connect(transport);
            
            this.isRunning = true;
            this.logger.log(`[MCP Server] Server started successfully`);
            
            // Show a notification to the user
            vscode.window.showInformationMessage(`mcpsx-run Server started`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[MCP Server] Failed to start server: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to start mcpsx-run Server: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Stop the MCP server
     */
    public async stop(): Promise<void> {
        if (!this.isRunning) {
            this.logger.warn('[MCP Server] Server is not running');
            return;
        }
        
        try {
            this.logger.log('[MCP Server] Stopping server...');
            
            // Close the server
            await this.server.close();
            
            this.isRunning = false;
            this.logger.log('[MCP Server] Server stopped successfully');
            
            // Show a notification to the user
            vscode.window.showInformationMessage('mcpsx-run Server stopped');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[MCP Server] Failed to stop server: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to stop mcpsx-run Server: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Check if the server is running
     * @returns True if the server is running, false otherwise
     */
    public isServerRunning(): boolean {
        return this.isRunning;
    }
}