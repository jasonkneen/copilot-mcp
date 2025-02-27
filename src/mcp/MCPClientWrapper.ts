import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { Transport } from '@modelcontextprotocol/sdk/client/transport';
import { Resource, Tool } from '@modelcontextprotocol/sdk/types';
import { ServerType } from '../server/ServerConfig';
import { ChildProcess } from 'child_process';

/**
 * Wrapper for MCP client with convenience methods
 */
export class MCPClientWrapper {
    private _client: MCPClient;
    private _transport: Transport;
    private _serverType: ServerType;
    private _tools: Tool[] = [];
    private _resources: Resource[] = [];
    
    /**
     * Create a new MCPClientWrapper
     * @param serverType The type of server
     */
    constructor(serverType: ServerType = ServerType.PROCESS) {
        this._serverType = serverType;
        
        // Create MCP client
        this._client = new MCPClient(
            { name: "copilot-mcp", version: "1.0" },
            { capabilities: { tools: {}, resources: {}, prompts: {} } }
        );
        
        // Initial empty transport, will be set properly in connect()
        this._transport = new StdioClientTransport({ command: "", args: [] });
    }
    
    /**
     * Get the underlying MCP client
     */
    public get client(): MCPClient {
        return this._client;
    }
    
    /**
     * Get the current tools
     */
    public get tools(): Tool[] {
        return this._tools;
    }
    
    /**
     * Get the current resources
     */
    public get resources(): Resource[] {
        return this._resources;
    }
    
    /**
     * Connect to a process-based MCP server
     * @param process The child process
     */
    public async connectToProcess(process: ChildProcess): Promise<void> {
        if (this._serverType !== ServerType.PROCESS) {
            throw new Error('Cannot connect to process with a non-process client');
        }
        
        const [cmd, ...args] = process.spawnargs;
        this._transport = new StdioClientTransport({ command: cmd, args });
        
        await this._connect();
    }
    
    /**
     * Connect to an SSE-based MCP server
     * @param url The server URL
     * @param authToken Optional auth token
     */
    public async connectToSSE(url: string, authToken?: string): Promise<void> {
        if (this._serverType !== ServerType.SSE) {
            throw new Error('Cannot connect to SSE with a non-SSE client');
        }
        
        const options: any = { url };
        if (authToken) {
            options.headers = {
                'Authorization': `Bearer ${authToken}`
            };
        }
        
        this._transport = new SSEClientTransport(options);
        
        await this._connect();
    }
    
    /**
     * Connect to the MCP server
     */
    private async _connect(): Promise<void> {
        // Connect client
        await this._client.connect(this._transport);
        
        // Set up error handler
        this._client.onerror = (error) => {
            console.error('MCP client error:', error);
        };
        
        // Setup notification handler
        this._client.fallbackNotificationHandler = this._handleNotification.bind(this);
        
        // Fetch initial tools and resources
        await this.refreshTools();
        await this.refreshResources();
    }
    
    /**
     * Refresh the tools list
     */
    public async refreshTools(): Promise<Tool[]> {
        try {
            const response = await this._client.listTools();
            this._tools = response.tools || [];
            return this._tools;
        } catch (error) {
            console.error('Error refreshing tools:', error);
            return [];
        }
    }
    
    /**
     * Refresh the resources list
     */
    public async refreshResources(): Promise<Resource[]> {
        try {
            const response = await this._client.listResources();
            this._resources = response.resources || [];
            return this._resources;
        } catch (error) {
            console.error('Error refreshing resources:', error);
            return [];
        }
    }
    
    /**
     * Handle notifications from the server
     */
    private async _handleNotification(notification: any): Promise<void> {
        console.log('Received notification:', notification);
        
        // Handle specific notifications
        if (notification.method === 'notifications/tools/list_changed') {
            await this.refreshTools();
        } else if (notification.method === 'notifications/resources/list_changed') {
            await this.refreshResources();
        }
    }
    
    /**
     * Disconnect from the server
     */
    public async disconnect(): Promise<void> {
        // Clean up handlers
        this._client.fallbackNotificationHandler = undefined;
        this._client.onerror = undefined;
        this._client.onclose = undefined;
        
        // Clear cached data
        this._tools = [];
        this._resources = [];
        
        // Close transport
        if (this._transport && typeof this._transport.close === 'function') {
            await this._transport.close();
        }
    }
}