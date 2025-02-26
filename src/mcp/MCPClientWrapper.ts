import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { CallToolRequest, Resource, Tool } from '@modelcontextprotocol/sdk/types';
import { ErrorHandler } from '../utils/ErrorHandler';
import { Logger } from '../utils/Logger';
import { ServerType } from '../server/ServerConfig';
import { SSEClientTransport } from './SSEClientTransport';

/**
 * Wrapper for the MCP client with improved error handling and reconnection logic
 */
export class MCPClientWrapper {
    private _client?: MCPClient;
    private _stdioTransport?: StdioClientTransport;
    private _sseTransport?: SSEClientTransport;
    private _connected: boolean = false;
    private _logger?: Logger;
    private _serverType: ServerType;

    /**
     * Creates a new MCP client wrapper
     * @param serverId The server ID
     * @param serverType The type of server (process or SSE)
     * @param process The child process running the server (for process servers)
     * @param outputChannel The output channel for logging
     * @param sseUrl URL for SSE connection (for SSE servers)
     * @param authToken Authentication token (for SSE servers)
     */
    constructor(
        private readonly serverId: string,
        serverType: ServerType,
        private readonly process?: ChildProcess,
        private readonly outputChannel?: vscode.OutputChannel,
        private readonly sseUrl?: string,
        private readonly authToken?: string
    ) {
        // Default to PROCESS if serverType is undefined for backward compatibility
        this._serverType = serverType || ServerType.PROCESS;
        
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }
        
        if (this._serverType === ServerType.PROCESS && (!process || !outputChannel)) {
            throw new Error('Process and outputChannel required for process servers');
        }
        
        if (this._serverType === ServerType.SSE && !sseUrl) {
            throw new Error('URL required for SSE servers');
        }
    }

    /**
     * Connect to the MCP server
     * @param retryCount Number of connection retries
     * @returns The connected client
     */
    public async connect(retryCount: number = 3): Promise<MCPClient> {
        try {
            if (this.outputChannel) {
                this.outputChannel.appendLine('Initializing MCP client...');
            }

            // Create MCP client
            this._client = new MCPClient(
                { name: "copilot-mcp", version: "1.0" },
                { capabilities: { tools: {}, resources: {}, prompts: {} } }
            );

            // Create appropriate transport based on server type
            if (this._serverType === ServerType.PROCESS && this.process) {
                // Standard process-based transport
                const [cmd, ...args] = this.process.spawnargs;
                this._stdioTransport = new StdioClientTransport({ command: cmd, args });
                await this._client.connect(this._stdioTransport);
            } else if (this._serverType === ServerType.SSE && this.sseUrl) {
                // SSE-based transport
                this._sseTransport = new SSEClientTransport(this.sseUrl, this.authToken);
                await this._sseTransport.connect();
                // NOTE: We need a custom integration here since SSE is one-way
                // For now, we'll just connect but might need custom handling
                await this._client.connect(this._sseTransport as any); // Type cast for compatibility
            } else {
                throw new Error('Invalid server configuration');
            }

            this._connected = true;

            if (this.outputChannel) {
                this.outputChannel.appendLine('MCP client initialized and connected');
            }

            if (this._logger) {
                this._logger.log(`MCP client connected to server ${this.serverId}`);
            }

            return this._client;
        } catch (error) {
            if (retryCount > 0 && this.outputChannel) {
                this.outputChannel.appendLine(`Connection failed, retrying... (${retryCount} attempts left)`);
                
                // Wait a second before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.connect(retryCount - 1);
            }
            
            ErrorHandler.handleError('MCP Client Connection', error);
            throw error;
        }
    }

    /**
     * Get the MCP client, connecting if necessary
     * @returns The MCP client
     */
    private async getClient(): Promise<MCPClient> {
        if (!this._client || !this._connected) {
            return this.connect();
        }
        return this._client;
    }

    /**
     * List available tools from the server
     * @returns Array of tools
     */
    public async listTools(): Promise<Tool[]> {
        try {
            const client = await this.getClient();
            const response = await client.listTools();
            const tools = response.tools || [];
            
            if (this.outputChannel) {
                this.outputChannel.appendLine(`Found ${tools.length} tools on server ${this.serverId}`);
            }
            
            return tools;
        } catch (error) {
            ErrorHandler.handleError('List Tools', error);
            return [];
        }
    }

    /**
     * List resources from the MCP server
     * @returns Array of resources
     */
    public async listResources(): Promise<Resource[]> {
        try {
            const client = await this.getClient();
            const response = await client.listResources();
            const resources = response.resources || [];
            
            if (this.outputChannel) {
                this.outputChannel.appendLine(`Found ${resources.length} resources on server ${this.serverId}`);
            }
            
            return resources;
        } catch (error) {
            if (ErrorHandler.isMethodNotSupportedError(error)) {
                // Don't show this as an error - many servers don't support resources
                this.outputChannel?.appendLine('Note: This MCP server does not support resource listing');
                return [];
            }
            
            ErrorHandler.handleError('List Resources', error);
            return [];
        }
    }

    /**
     * Call a tool on the MCP server
     * @param params The tool call parameters
     * @returns The tool call result
     */
    public async callTool(params: CallToolRequest["params"]): Promise<any> {
        try {
            const client = await this.getClient();
            return await client.callTool(params);
        } catch (error) {
            ErrorHandler.handleError(`Call Tool: ${params.name}`, error, this.outputChannel, true);
            throw error;
        }
    }

    /**
     * Read a resource from the MCP server
     * @param uri The resource URI
     * @returns The resource content
     */
    public async readResource(uri: string): Promise<any> {
        try {
            const client = await this.getClient();
            return await client.readResource({ uri });
        } catch (error) {
            if (ErrorHandler.isMethodNotSupportedError(error)) {
                // Don't show this as an error - many servers don't support resources
                this.outputChannel?.appendLine('Note: This MCP server does not support resource reading');
                return null;
            }

            ErrorHandler.handleError(`Read Resource: ${uri}`, error, this.outputChannel, true);
            throw error;
        }
    }

    /**
     * Dispose the client resources
     */
    public dispose(): void {
        try {
            // Clean up MCP client if it exists
            if (this._client) {
                this._client.fallbackNotificationHandler = undefined;
            }
        } catch (error) {
            console.error('Error cleaning up MCP client:', error);
        }
    }
} 