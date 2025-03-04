import * as vscode from 'vscode';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    ListResourceTemplatesRequestSchema,
    ListResourcesRequestSchema,
    McpError,
    Tool
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/Logger';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InstanceManager, InstanceEvents } from '../utils/InstanceManager';

/**
 * SimpleMcpSseServer class that implements an MCP server using SSE transport
 * This server exposes the tools from all connected MCP clients
 * Based on the example provided
 */
export class SimpleMcpSseServer {
    private server: Server;
    private logger: Logger;
    private isRunning: boolean = false;
    private port: number;
    private clients: Map<string, Client> = new Map();
    private expressApp: any;
    private expressServer: any;
    private transport: any = null;
    private instanceManager: InstanceManager;
    private serverId: string | null = null;

    constructor(port: number = 3000) {
        this.logger = Logger.getInstance();
        this.port = port;
        this.instanceManager = InstanceManager.getInstance();
        
        // Initialize Express app
        this.expressApp = express();
        this.expressApp.disable('x-powered-by');
        
        // Add middleware to parse JSON requests
        this.expressApp.use(express.json());
        
        // Initialize the MCP server
        this.server = new Server(
            {
                name: 'copilot-mcpsx-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                    resources: {
                        list: true,
                        templates: {
                            list: true
                        }
                    }
                },
            }
        );

        // Set up error handling
        this.server.onerror = (error: any) => {
            this.logger.error(`[MCP SSE Server] Error: ${error}`);
        };

        // Register request handlers
        this.setupRequestHandlers();
        
        // Set up Express routes
        this.setupExpressRoutes();
    }

    /**
     * Set up the request handlers for the MCP server
     */
    private setupRequestHandlers(): void {
        // Handler for listing tools from all connected clients
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            this.logger.log('[MCP SSE Server] Handling ListTools request');
            
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
                        this.logger.log(`[MCP SSE Server] Added ${prefixedTools.length} tools from client ${clientId}`);
                    }
                } catch (error) {
                    this.logger.warn(`[MCP SSE Server] Error fetching tools from client ${clientId}: ${error}`);
                }
            }
            
            this.logger.log(`[MCP SSE Server] Returning ${allTools.length} tools in total`);
            return { tools: allTools };
        });

        // Handler for calling tools by forwarding to the appropriate client
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const toolName = request.params.name;
            this.logger.log(`[MCP SSE Server] Handling CallTool request for tool: ${toolName}`);
            
            // Extract client ID and original tool name from the prefixed tool name
            const parts = toolName.split('_');
            if (parts.length < 2) {
                this.logger.error(`[MCP SSE Server] Invalid tool name format: ${toolName}`);
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
                this.logger.error(`[MCP SSE Server] Client not found: ${clientId}`);
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Client not found: ${clientId}`
                );
            }
            
            try {
                this.logger.log(`[MCP SSE Server] Forwarding tool call to client ${clientId} for tool ${originalToolName}`);
                
                // Forward the tool call to the original client
                const payload = {
                    name: originalToolName,
                    arguments: request.params.arguments
                };
                
                this.logger.log(`[MCP SSE Server] Sending payload: ${JSON.stringify(payload)}`);
                
                // Call the tool
                const result = await client.callTool(payload);
                
                if (result.error) {
                    this.logger.error(`[MCP SSE Server] Error from client ${clientId}: ${JSON.stringify(result.error)}`);
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Error from client ${clientId}: ${JSON.stringify(result.error)}`
                    );
                }
                
                this.logger.log(`[MCP SSE Server] Tool execution successful: ${originalToolName}`);
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`[MCP SSE Server] Tool execution error: ${errorMessage}`);
                
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

        // Handler for JSON-RPC resources/list request
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            this.logger.log('[MCP SSE Server] Handling resources list request');
            return { resources: [] };
        });

        // Handler for JSON-RPC resources/templates/list request
        this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
            this.logger.log('[MCP SSE Server] Handling resources templates list request');
            return { templates: [] };
        });
    }
    
    /**
     * Set up Express routes for SSE
     */
    private setupExpressRoutes(): void {
        // Enable CORS
        this.expressApp.use((req: any, res: any, next: any) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
        
        // SSE endpoint
        this.expressApp.get('/sse', (req: any, res: any) => {
            this.logger.log(`[MCP SSE Server] SSE connection request received`);
            
            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders(); // Flush the headers to establish SSE connection
            
            // Send a comment to keep the connection alive
            res.write(': SSE connection established\n\n');
            
            // Send an initial ping event to keep the connection alive
            res.write('event: ping\ndata: {}\n\n');
            
            // Set up a heartbeat to keep the connection alive
            const heartbeat = setInterval(() => {
                res.write('event: ping\ndata: {}\n\n');
            }, 30000);
            
            // Handle client disconnect
            req.on('close', () => {
                this.logger.log('[MCP SSE Server] SSE connection closed');
                clearInterval(heartbeat);
            });
            
            this.logger.log('[MCP SSE Server] SSE connection established');
        });
        
        // Message endpoint for POST requests
        this.expressApp.post('/messages', (req: any, res: any) => {
            this.logger.log(`[MCP SSE Server] Received POST message`);
            
            try {
                // Extract the JSON-RPC request
                const jsonRpcRequest = req.body;
                this.logger.log(`[MCP SSE Server] JSON-RPC request: ${JSON.stringify(jsonRpcRequest)}`);
                
                // Check if it's a valid JSON-RPC request
                if (!jsonRpcRequest || !jsonRpcRequest.jsonrpc || jsonRpcRequest.jsonrpc !== '2.0') {
                    this.logger.error('[MCP SSE Server] Invalid JSON-RPC request');
                    res.status(400).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32600,
                            message: 'Invalid Request'
                        },
                        id: jsonRpcRequest?.id || null
                    });
                    return;
                }
                
                // Handle the request based on the method
                const method = jsonRpcRequest.method;
                const id = jsonRpcRequest.id;
                
                // Return an empty result for all methods
                const response = {
                    jsonrpc: '2.0',
                    id: id,
                    result: {}
                };
                
                // If it's a tools/list request, return an empty tools array
                if (method === 'tools/list') {
                    response.result = { tools: [] };
                } else if (method === 'resources/list') {
                    response.result = { resources: [] };
                } else if (method === 'resources/templates/list') {
                    response.result = { templates: [] };
                }
                
                this.logger.log(`[MCP SSE Server] Sending response: ${JSON.stringify(response)}`);
                res.status(200).json(response);
            } catch (error) {
                this.logger.error(`[MCP SSE Server] Error handling message: ${error}`);
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal error'
                    },
                    id: null
                });
            }

            this.logger.log('[MCP SSE Server] Message handled');
        });
        
        // Health check endpoint
        this.expressApp.get('/', (req: any, res: any) => {
            this.logger.log(`[MCP SSE Server] Health check`);
            res.status(200).send('MCP SSE Server is running');
        });

        // Resources list endpoint
        this.expressApp.get('/resources/list', (req: any, res: any) => {
            this.logger.log(`[MCP SSE Server] GET Resources list request - not used by supergateway`);
            res.status(200).send('Resources list endpoint');
        });

        // Resources templates list endpoint
        this.expressApp.get('/resources/templates/list', (req: any, res: any) => {
            this.logger.log(`[MCP SSE Server] GET Resources templates list request - not used by supergateway`);
            res.status(200).send('Resources templates list endpoint');
        });
    }
    
    /**
     * Register a client with the MCP server
     * @param clientId The ID of the client
     * @param client The MCP client
     */
    public registerClient(clientId: string, client: Client): void {
        this.logger.log(`[MCP SSE Server] Registering client: ${clientId}`);
        this.clients.set(clientId, client);
    }

    /**
     * Unregister a client from the MCP server
     * @param clientId The ID of the client
     */
    public unregisterClient(clientId: string): void {
        this.logger.log(`[MCP SSE Server] Unregistering client: ${clientId}`);
        this.clients.delete(clientId);
    }

    /**
     * Start the MCP server
     */
    public async start(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('[MCP SSE Server] Server is already running');
            return;
        }
        
        try {
            this.logger.log(`[MCP SSE Server] Starting server on port ${this.port}...`);
            
            // Clean up stale instances before starting
            this.instanceManager.cleanupStaleInstances();
            this.logger.log('[MCP SSE Server] Cleaned up stale instances');
            
            // Start the Express server
            this.expressServer = this.expressApp.listen(this.port, '127.0.0.1', () => {
                this.isRunning = true;
                this.logger.log(`[MCP SSE Server] Server started successfully on localhost:${this.port}`);
                
                // Register this server instance
                const pid = process.pid;
                this.serverId = this.instanceManager.registerInstance(
                    pid,
                    'vscode-extension',
                    'mcpsx-sse-server',
                    vscode.env.appName,
                    JSON.stringify({
                        name: 'mcpsx-sse-server',
                        port: this.port
                    }),
                    {
                        appName: vscode.env.appName,
                        appRoot: vscode.env.appRoot,
                        machineId: vscode.env.machineId
                    },
                    'sse'
                );
                
                this.logger.log(`[MCP SSE Server] Registered self with instance ID: ${this.serverId}`);
                
                // Show a notification to the user
                vscode.window.showInformationMessage(`mcpsx-run SSE Server started on localhost:${this.port}`);
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[MCP SSE Server] Failed to start server: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to start mcpsx-run SSE Server: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Stop the MCP server
     */
    public async stop(): Promise<void> {
        if (!this.isRunning) {
            this.logger.warn('[MCP SSE Server] Server is not running');
            return;
        }
        
        try {
            this.logger.log('[MCP SSE Server] Stopping server...');
            
            // Update instance status if we have a server ID
            if (this.serverId) {
                this.instanceManager.updateInstanceStatus(this.serverId, 'stopped');
                this.logger.log(`[MCP SSE Server] Updated instance ${this.serverId} status to stopped`);
            }
            
            // Close the server
            if (this.expressServer) {
                this.expressServer.close();
            }
            
            // Close the MCP server
            await this.server.close();
            
            this.isRunning = false;
            this.transport = null;
            this.logger.log('[MCP SSE Server] Server stopped successfully');
            
            // Show a notification to the user
            vscode.window.showInformationMessage('mcpsx-run SSE Server stopped');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`[MCP SSE Server] Failed to stop server: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to stop mcpsx-run SSE Server: ${errorMessage}`);
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

    /**
     * Get the port the server is running on
     * @returns The port number
     */
    public getPort(): number {
        return this.port;
    }

    /**
     * Get the URL of the server
     * @returns The server URL
     */
    public getUrl(): string {
        return `http://127.0.0.1:${this.port}`;
    }
}