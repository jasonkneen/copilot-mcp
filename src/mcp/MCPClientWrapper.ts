import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { CallToolRequest, Resource, Tool } from '@modelcontextprotocol/sdk/types';
import { ErrorHandler } from '../utils/ErrorHandler';
import { Logger } from '../utils/Logger';

/**
 * Wrapper for the MCP client with improved error handling and reconnection logic
 */
export class MCPClientWrapper {
    private _client?: MCPClient;
    private _transport?: StdioClientTransport;
    private _connected: boolean = false;
    private _logger?: Logger;

    /**
     * Creates a new MCP client wrapper
     * @param serverId The server ID
     * @param process The child process running the server
     * @param outputChannel The output channel for logging
     */
    constructor(
        private readonly serverId: string,
        private readonly process: ChildProcess,
        private readonly outputChannel: vscode.OutputChannel
    ) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }
    }

    /**
     * Connect to the MCP server
     * @param retryCount Number of connection retries
     * @returns The connected client
     */
    public async connect(retryCount: number = 3): Promise<MCPClient> {
        try {
            this.outputChannel.appendLine('Initializing MCP client...');

            // Create MCP client
            this._client = new MCPClient(
                { name: "copilot-mcp", version: "1.0" },
                { capabilities: { tools: {}, resources: {}, prompts: {} } }
            );

            // Parse command and arguments
            const [cmd, ...args] = this.process.spawnargs;

            // Create transport using process stdio
            this._transport = new StdioClientTransport({ command: cmd, args });

            // Connect client
            await this._client.connect(this._transport);
            this._connected = true;
            this.outputChannel.appendLine('MCP client connected successfully');

            return this._client;
        } catch (error) {
            this._connected = false;
            this.outputChannel.appendLine(`Failed to initialize MCP client: ${error instanceof Error ? error.message : 'Unknown error'}`);

            if (retryCount > 0) {
                this.outputChannel.appendLine(`Retrying connection (${retryCount} attempts left)...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.connect(retryCount - 1);
            }

            throw error;
        }
    }

    /**
     * Get the client instance, reconnecting if necessary
     * @returns The MCP client
     */
    private async getClient(): Promise<MCPClient> {
        if (!this._client || !this._connected) {
            return this.connect();
        }

        try {
            // Check if client is still connected with a ping
            await this._client.ping();
            return this._client;
        } catch (error) {
            this.outputChannel.appendLine('Lost connection to MCP server, reconnecting...');
            return this.connect();
        }
    }

    /**
     * List tools from the MCP server
     * @returns Array of tools
     */
    public async listTools(): Promise<Tool[]> {
        try {
            const client = await this.getClient();
            const response = await client.listTools();
            return response.tools ?? [];
        } catch (error) {
            ErrorHandler.handleError('List Tools', error, this.outputChannel, false);
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
            return response.resources ?? [];
        } catch (error) {
            if (ErrorHandler.isMethodNotSupportedError(error)) {
                this.outputChannel.appendLine('Note: This MCP server does not support resource listing');
                return [];
            }

            ErrorHandler.handleError('List Resources', error, this.outputChannel, false);
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
                this.outputChannel.appendLine('Note: This MCP server does not support resource reading');
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