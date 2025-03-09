import * as vscode from 'vscode';
import { sendChatParticipantRequest } from '@vscode/chat-extension-utils';
import { NamedClient } from '@/tools';
/**
 * Handles chat functionality for MCP integration by providing
 * chat handling and followup capabilities
 */
export class ChatHandler implements vscode.ChatFollowupProvider {
  private _participant?: vscode.ChatParticipant;
  private _logoPath: vscode.Uri;
  private _clients: NamedClient[];

  /**
   * Creates a new chat handler
   * @param toolManager The tool manager instance
   * @param resourceManager The resource manager instance
   * @param extensionUri The extension URI
   */
  constructor(
    clients: NamedClient[],
    private readonly extensionUri: vscode.ExtensionContext['extensionUri']
  ) {
    console.log('ChatHandler initialized');
    console.log('Tools: ', vscode.lm.tools.filter(tool => tool.tags?.includes('mcpManager')));
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
      console.log(`Handling chat request: ${request.prompt}`);

      // Handle special commands
      if (request.command === 'listResources') {
        return this._handleListResourcesCommand(stream);
      }
      // Get all available tools from the tool manager
      // const allTools = await this.mcpClientManager.listTools();
      const tools = vscode.lm.tools;
      // get all the previous participant messages
      const messages = [];
      const previousMessages = context.history.filter(
        h => h instanceof vscode.ChatResponseTurn
      );
      // add the previous messages to the messages array
      previousMessages.forEach(m => {
        let fullMessage = '';
        m.response.forEach(r => {
          const mdPart = r as vscode.ChatResponseMarkdownPart;
          fullMessage += mdPart.value.value;
        });
        messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
      });
      

      console.log("Available tools:", tools.length);

      // Forward the request to VS Code's chat system with our tools
      const chatResult = sendChatParticipantRequest(request, context, {
        prompt: `
        You are a helpful assistant. 
        You can use the following tools to assist the user:
        ${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}
        If the user specifies a tool, find and use it to assist them.
        `,
        responseStreamOptions: {
          stream,
          references: true,
          responseText: true,
        },
        tools: tools,

      }, token);
      stream.progress(
        "Thinking..."
      );
      const result = await chatResult.result;

      if (result.errorDetails) {
        stream.push(new vscode.ChatResponseMarkdownPart(
          new vscode.MarkdownString(`I encountered an error: ${result.errorDetails}`)
        ));
        return {
          metadata: {
            command: 'error',
            error: result.errorDetails
          }
        };
      }
      return result;
    } catch (error) {
      console.error('Error handling chat request:', error);

      // Return a fallback response
      stream.push(new vscode.ChatResponseMarkdownPart(
        new vscode.MarkdownString(`I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      ));

      return {};
    }
  }

  private async getUserIntent(prompt: string, request: vscode.ChatRequest, context: vscode.ChatContext) {
    const tools = vscode.lm.tools;
    const chatResult = sendChatParticipantRequest(request, context, {
      prompt: `
      You are a helpful assistant. You can use the following tools to assist the user:
      ${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}
      `,
    }, request.toolInvocationToken);
    const result = await chatResult.result;
    return result;
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
    if (result.metadata?.command === 'readResource') {
      return [
        {
          label: 'Read Resource',
          command: 'copilot-mcp.readResource',
          prompt: 'Read the resource'
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
    for (const client of this._clients) {
      try {
        const resourcesResponse = await client.listResources();
        resources.push(...resourcesResponse.resources);
      } catch (e) {
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
        command: 'readResource'
      }
    };
  }

  /**
   * Register the chat participant
   * @returns The chat participant disposable
   */
  public register(): vscode.Disposable {
    // Create the chat participant with a handler function
    const participant = vscode.chat.createChatParticipant(
      'copilot-mcp.mcp',
      (request, context, stream, token) => this.handleRequest(request, context, stream, token)
    );

    // Set followup provider (this class implements the interface)
    participant.followupProvider = this;

    // Set icon path
    participant.iconPath = this._logoPath;

    // Store the participant reference
    this._participant = participant;

    return participant;
  }

  set clients(clients: NamedClient[]) {
    this._clients = clients;
  }

  get clients() {
    return this._clients;
  }

  set participant(participant: vscode.ChatParticipant) {
    this._participant = participant;
  }

  get participant() {
    if (!this._participant) {
      throw new Error('Participant not set');
    }
    return this._participant;
  }

  /**
   * Static factory method to create and register a chat handler
   * @param context The extension context
   * @param toolManager The tool manager
   * @param resourceManager The resource manager
   * @returns The chat participant disposable
   */
  public static register(
    context: vscode.ExtensionContext,
    clients: NamedClient[]
  ): vscode.Disposable {
    const handler = new ChatHandler(clients, context.extensionUri);
    return handler.register();
  }
}