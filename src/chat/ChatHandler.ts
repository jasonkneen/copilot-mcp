import * as vscode from 'vscode';
import { sendChatParticipantRequest } from '@vscode/chat-extension-utils';
import { Resource } from "@modelcontextprotocol/sdk/types";

/**
 * Handles chat functionality for MCP integration
 */
export class ChatHandler {
  /**
   * Static handler for chat requests from the MCP server view provider
   * @param resources Available resources to display
   * @param tools Available tools for the chat
   * @param request The chat request
   * @param context The chat context
   * @param stream The response stream
   * @param token The cancellation token
   * @returns The chat result
   */
  public static async handleChatRequest(
    resources: Resource[],
    tools: vscode.LanguageModelChatTool[],
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    try {
      console.log(`Handling chat request: ${request.prompt}`);

      // Handle special commands
      if (request.command === 'listResources') {
        return ChatHandler.handleListResourcesCommand(resources, stream);
      }
      
      console.log("Available tools:", tools.length);
      
      // Forward the request to VS Code's chat system with our tools
      const chatResult = sendChatParticipantRequest(request, context, {
        responseStreamOptions: {
          stream,
          references: true,
          responseText: true
        },
        tools: tools
      }, token);
      
      return await chatResult.result;
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
   * Handle the listResources command
   * @param resources The resources to list
   * @param stream The response stream
   */
  private static async handleListResourcesCommand(
    resources: Resource[],
    stream: vscode.ChatResponseStream
  ): Promise<vscode.ChatResult> {
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
}