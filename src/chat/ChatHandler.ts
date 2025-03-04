import * as vscode from 'vscode';
import { sendChatParticipantRequest } from '@vscode/chat-extension-utils';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerConfig } from "../server/ServerConfig";
import { Logger } from "../utils/Logger";

/**
 * Handles chat functionality for MCP integration by providing
 * chat handling and followup capabilities
 */
export class ChatHandler implements vscode.ChatFollowupProvider {
  private _participants: Map<string, vscode.Disposable> = new Map();
  private _logoPath: vscode.Uri;
  private _clients: Client[];
  private logger: Logger;

  /**
   * Creates a new chat handler
   * @param clients The MCP clients
   * @param extensionUri The extension URI
   */
  constructor(
    private readonly clients: Client[],
    private readonly extensionUri: vscode.ExtensionContext['extensionUri']
  ) {
    this.logger = Logger.getInstance();
    console.log('ChatHandler initialized');
    console.log('Tools: ', vscode.lm.tools.filter(tool => tool.tags?.includes('mcpsx')));
    // Set the logo path for the participant
    this._logoPath = vscode.Uri.joinPath(this.extensionUri, 'icon.png');
    this._clients = clients;
  }

  /**
   * Implement the ChatRequestHandler interface method
   * @param request The chat request
   * @param context The chat context
   * @param stream The response stream
   * @param token The cancellation token
   * @returns The chat result
   */
  public async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream, 
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    try {
      this.logger.log(`Handling chat request: ${request.prompt}`);

      // Handle special commands
      if (request.command === 'listResources') {
        return this._handleListResourcesCommand(stream);
      } else if (request.command === 'list') {
        return this._handleListCommand(stream);
      } else if (request.command === 'tools') {
        return this._handleToolsCommand(stream);
      } else if (request.command === 'use') {
        return this._handleUseCommand(request.prompt, stream);
      } else {
        // For specific server commands, filter tools by server
        const serverSpecificCommand = request.command ? await this._getServerForCommand(request.command) : null;
        if (serverSpecificCommand) {
          return this._handleServerSpecificCommand(request, context, stream, token, serverSpecificCommand);
        }
      }
      
      // Get all tools with the mcpsx tag
      let tools = vscode.lm.tools.filter(tool => {
        // Get all tools with the mcpsx tag
        return tool.tags?.includes('mcpsx');
      });
      
      this.logger.log(`Available tools for request: ${tools.length}`);
      
      // Forward the request to VS Code's chat system with our tools
      const chatResult = sendChatParticipantRequest(request, context, {
        prompt: `
        You are a helpful assistant. You can use the following tools to assist the user:
        ${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}
        `,
        responseStreamOptions: {
          stream,
          references: true,
          responseText: true,
        },
        tools: tools
      }, token);
      stream.progress(
        "Thinking..."
      );
      const result = chatResult.result;

      return await result;
    } catch (error) {
      console.error('Error handling chat request:', error);
      
      // Return a fallback response
      stream.push(new vscode.ChatResponseMarkdownPart(
        new vscode.MarkdownString(`I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      ));
      
      return {};
    }
  }
  
  /**
   * Get the server name for a specific command
   * @param command The command name (e.g., read_graph)
   * @returns The server name if the command is server-specific, null otherwise
   */
  private async _getServerForCommand(command: string): Promise<string | null> {
    // Check if this is a server-specific command
    for (const client of this._clients) {
      try {
        const serverInfo = client.getServerVersion();
        if (serverInfo && serverInfo.name) {
          const serverName = serverInfo.name;          
          const serverSlug = serverName.toLowerCase().replace(/\s+/g, '-'); // Create a consistent slug

          // Try to get tools directly from the client
          let serverTools: any[] = [];
          try {
            const toolsResponse = await client.listTools();
            if (toolsResponse.tools && toolsResponse.tools.length > 0) {
              serverTools = toolsResponse.tools;
            }
          } catch (e) {
            this.logger.warn(`Failed to get tools from client ${serverName}: ${e}`);
            // Fall back to VS Code tools
            serverTools = vscode.lm.tools.filter(tool => 
              tool.tags?.includes('mcpsx') && 
              (
                tool.tags?.includes(serverName) || 
                (tool.name && tool.name.startsWith(`${serverSlug}.`))
              )
            );
          }
          
          // Check if this command belongs to this server
          const tools = serverTools.filter(tool => 
            tool.name === command || 
            tool.name === `${serverSlug}.${command}`
          );

          // Log the tools found for debugging
          this.logger.log(`Found ${tools.length} tools matching command ${command} for server ${serverName}`);
          
          if (tools.length > 0) {
            return serverName;
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to get server info: ${e}`);
      }
    }
    
    return null;
  }
  
  /**
   * Handle a server-specific command
   */
  private async _handleServerSpecificCommand(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    serverName: string 
  ): Promise<vscode.ChatResult> {
    // Filter tools to only include those from the specific server
    const serverSlug = serverName.toLowerCase().replace(/\s+/g, '-');
    
    // Get tools that belong to this server
    const tools = vscode.lm.tools.filter(tool => 
      tool.tags?.includes('mcpsx') && 
      (
        tool.tags?.includes(serverName) || 
        (tool.name && tool.name.startsWith(`${serverSlug}.`))
      )
    );
    
    this.logger.log(`Server-specific tools for ${serverName}: ${tools.length}`);

    // Forward the request to VS Code's chat system with filtered tools
    const chatResult = sendChatParticipantRequest(request, context, {
      prompt: `
      You are a helpful assistant for the ${serverName} server. You can use the following tools to assist the user:
      ${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}
      `,
      responseStreamOptions: {
        stream,
        references: true,
        responseText: true,
      },
      tools: tools
    }, token);
    
    stream.progress("Thinking...");
    const result = chatResult.result;
    
    return await result;
  }
  
  /**
   * Handle the list command - lists all available MCP servers
   * @param stream The response stream
   */
  private async _handleListCommand(
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    markdown.appendMarkdown(`<h2>Available MCP Servers</h2>`);
    
    // Get server information from clients
    const servers = [];
    for (const client of this._clients) {
      try {
        const serverInfo = client.getServerVersion();
        if (serverInfo && serverInfo.name) {
          servers.push({
            name: serverInfo.name,
            version: serverInfo.version || 'unknown'
          });
        }
      } catch (e) {
        this.logger.warn(`Failed to get server info: ${e}`);
      }
    }
    
    if (servers.length === 0) {
      markdown.appendMarkdown(`<p>No MCP servers found</p>`);
    } else {
      markdown.appendMarkdown(`<table>`);
      markdown.appendMarkdown(`<tr><th>Name</th><th>Version</th></tr>`);
      
      for (const server of servers) {
        markdown.appendMarkdown(`<tr><td>${server.name}</td><td>${server.version}</td></tr>`);
      }
      
      markdown.appendMarkdown(`</table>`);
      
      // Add usage instructions
      markdown.appendMarkdown(`<h3>Usage</h3>`);
      markdown.appendMarkdown(`<p>You can reference servers using @servername in your messages.</p>`);
      markdown.appendMarkdown(`<p>Example: "Use @${servers[0].name.toLowerCase().replace(/\s+/g, '')} to process this data"</p>`);
    }
    
    stream.push(new vscode.ChatResponseMarkdownPart(markdown));
    
    return {
      metadata: {
        command: 'list'
      }
    };
  }
  
  /**
   * Handle the tools command - lists all available MCP tools
   * @param stream The response stream
   */
  private async _handleToolsCommand(
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    markdown.appendMarkdown(`<h2>Available MCP Tools</h2>`);
    
    // Get all tools with the mcpsx tag
    const tools = vscode.lm.tools.filter(tool => tool.tags?.includes('mcpsx'));
    
    if (tools.length === 0) {
      markdown.appendMarkdown(`<p>No MCP tools found</p>`);
    } else {
      markdown.appendMarkdown(`<table>`);
      markdown.appendMarkdown(`<tr><th>Name</th><th>Description</th><th>Server</th></tr>`);
      
      for (const tool of tools) {
        // Find which server this tool belongs to
        const serverTag = tool.tags?.find(tag => tag !== 'mcpsx');
        const serverName = serverTag || 'Unknown';
        
        markdown.appendMarkdown(`<tr><td>${tool.name}</td><td>${tool.description || 'No description'}</td><td>${serverName}</td></tr>`);
      }
      
      markdown.appendMarkdown(`</table>`);
      
      // Add usage instructions
      markdown.appendMarkdown(`<h3>Usage</h3>`);
      markdown.appendMarkdown(`<p>You can use these tools directly in your messages.</p>`);
      markdown.appendMarkdown(`<p>Example: "Can you ${tools[0].name} for me?"</p>`);
    }
    
    stream.push(new vscode.ChatResponseMarkdownPart(markdown));
    
    return {
      metadata: {
        command: 'tools'
      }
    };
  }
  
  /**
   * Handle the use command - activates a specific MCP server
   * @param prompt The command prompt containing the server name
   * @param stream The response stream
   */
  private async _handleUseCommand(
    prompt: string,
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    
    // Extract server name from prompt
    const serverName = prompt.trim();
    
    if (!serverName) {
      markdown.appendMarkdown(`<p>Error: Server name is required</p>`);
      markdown.appendMarkdown(`<p>Usage: /use [server-name]</p>`);
      stream.push(new vscode.ChatResponseMarkdownPart(markdown));
      return {};
    }
    
    // Find the server
    let found = false;
    for (const client of this._clients) {
      try {
        const serverInfo = client.getServerVersion();
        if (serverInfo && 
            (serverInfo.name === serverName || 
             serverInfo.name.toLowerCase() === serverName.toLowerCase())) {
          found = true;
          
          // Get tools for this server
          const toolsResponse = await client.listTools();
          const tools = toolsResponse.tools || [];
          
          markdown.appendMarkdown(`<h2>Using MCP Server: ${serverInfo.name}</h2>`);
          markdown.appendMarkdown(`<p>Version: ${serverInfo.version || 'unknown'}</p>`);
          
          if (tools.length > 0) {
            markdown.appendMarkdown(`<h3>Available Tools:</h3>`);
            markdown.appendMarkdown(`<ul>`);
            for (const tool of tools) {
              markdown.appendMarkdown(`<li><strong>${tool.name}</strong>: ${tool.description || 'No description'}</li>`);
            }
            markdown.appendMarkdown(`</ul>`);
          } else {
            markdown.appendMarkdown(`<p>No tools available for this server</p>`);
          }
          
          break;
        }
      } catch (e) {
        this.logger.warn(`Failed to get server info: ${e}`);
      }
    }
    
    if (!found) {
      markdown.appendMarkdown(`<p>Error: No MCP server found with name "${serverName}"</p>`);
      markdown.appendMarkdown(`<p>Use /list to see available servers</p>`);
    }
    
    stream.push(new vscode.ChatResponseMarkdownPart(markdown));
    
    return {
      metadata: {
        command: 'use'
      }
    };
  }

  /**
   * Implement the ChatFollowupProvider interface method
   * @param result The chat result
   * @param context The context
   * @param token The cancellation token
   * @returns The followup items
   */
  public provideFollowups(
    result: vscode.ChatResult,
    context: vscode.ChatContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ChatFollowup[]> {
    // Check if this is a resource-related result
    if (result.metadata?.command === 'resources') {
      return [
        {
          label: 'Read Resource',
          command: 'mcpsx-run.studio.listResources',
          prompt: '/listResources'
        }
      ];
    } else if (result.metadata?.command === 'tools') {
      return [
        {
          label: 'List tools',
          command: 'mcpsx-run.studio.tools',
          prompt: '/list'
        }
      ];
    } else if (result.metadata?.command === 'servers') {
      return [
        {
          label: 'List Servers',
          command: 'mcpsx-run.studio.servers',
          prompt: '/servers'
        },
        {
          label: 'List Tools',
          command: 'mcpsx-run.studio.tools',
          prompt: '/tools'
        }
      ];
    }
    return [];
  }

  /**
   * Handle the listResources command
   * @param stream The response stream
   */
  private async _handleListResourcesCommand(
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
    // Get resources from the resource manager
    const resources = [];
    for(const client of this._clients) {
      try {
        const resourcesResponse = await client.listResources();
        resources.push(...resourcesResponse.resources);
      } catch(e) {
        console.warn(`Failed to list resources for client ${client.getServerVersion()?.name}:`);
      }
    }
      
    if (resources.length === 0) {
      stream.push(new vscode.ChatResponseMarkdownPart(
        new vscode.MarkdownString("No resources found")
      ));
      return {};
    }
    
    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    markdown.appendMarkdown(`<h2>Resources</h2>`);
    
    for (const resource of resources) {
      markdown.appendMarkdown(`<strong>${resource.name}:</strong>`);
      
      // Display appropriate resource info based on its type
      if (resource.mimeType === 'text/plain' && resource.text) {
        markdown.appendMarkdown(`<p>${resource.text}</p>`);
      } else if (resource.mimeType === 'application/octet-stream' && resource.blob) {
        try {
          const text = Buffer.from(resource.blob as string, 'base64').toString('utf-8');
          markdown.appendMarkdown(`<p>${text}</p>`);
        } catch (error) {
          markdown.appendMarkdown(`<p>Binary content (cannot display inline)</p>`);
        }
      } else {
        markdown.appendMarkdown(`<p>Type: ${resource.mimeType || 'unknown'}</p>`);
      }
      
      markdown.appendMarkdown(`<p>URI: ${resource.uri}</p>`);
      markdown.appendMarkdown('<hr>');
    }
    
    stream.push(new vscode.ChatResponseMarkdownPart(markdown));
    
    return {
      metadata: {
        command: 'resources'
      }
    };
  }

  /**
   * Register the chat participant
   * @param id The participant ID
   * @param name The participant display name
   * @param description The participant description
   * @param isSticky Whether the participant should be sticky
   * @returns The chat participant disposable
   */
  public register(id: string, name: string, description?: string, isSticky?: boolean): vscode.Disposable {
    this.logger.log(`Registering chat participant: ${id} (${name})`);
    
    // Create the chat participant with a handler function
    const participant = vscode.chat.createChatParticipant(
      id, 
      (request, context, stream, token) => this.handleRequest(request, context, stream, token)
    );
    
    // Set followup provider (this class implements the interface)
    participant.followupProvider = this;
    
    // Set icon path
    participant.iconPath = this._logoPath;
    
    // Store the participant reference in the map
    this._participants.set(id, participant);
    
    return participant;
  }
  
  /**
   * Register chat participants for all servers
   * @param context The extension context
   * @param clients The MCP clients
   * @param serverConfigs The server configurations
   * @returns An array of disposables for the registered chat participants
   */
  public static registerForServers(
    context: vscode.ExtensionContext,
    clients: Client[],
    serverConfigs: ServerConfig[]
  ): vscode.Disposable[] {
    const handler = new ChatHandler(clients, context.extensionUri);
    const disposables: vscode.Disposable[] = [];
    
    // Register the default mcpsx-run participant
    disposables.push(handler.register('mcpsx-run.studio', 'mcpsx-run', 'Run MCP Servers and tooling', true));
    
    // Register participants for each server with chatParticipant.enabled=true
    for (const config of serverConfigs) {
      if (config.chatParticipant?.enabled) {
        const id = `mcpsx-run.studio.${config.name.toLowerCase().replace(/\s+/g, '-')}`;
        const name = config.chatParticipant.name || config.name;
        const description = config.chatParticipant.description || `Tools for ${config.name}`;
        const isSticky = config.chatParticipant.isSticky !== undefined ? config.chatParticipant.isSticky : false;
        
        disposables.push(handler.register(id, name, description, isSticky));
      }
    }
    
    return disposables;
  }

  /**
   * Static factory method to create and register a chat handler
   * @param context The extension context
   * @param clients The MCP clients
   * @returns The chat participant disposable
   */
  public static register(
    context: vscode.ExtensionContext,
    clients: Client[]
  ): vscode.Disposable {
    const handler = new ChatHandler(clients, context.extensionUri);
    return handler.register('mcpsx-run.studio', 'mcpsx-run', 'Run MCP Servers and tooling', true);    
  }
}