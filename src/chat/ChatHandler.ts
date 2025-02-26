import * as vscode from 'vscode';
import { sendChatParticipantRequest } from '@vscode/chat-extension-utils';
import { ToolManager } from '../mcp/ToolManager';
import { ResourceManager } from '../mcp/ResourceManager';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';

/**
 * Handles chat functionality for MCP integration
 */
export class ChatHandler {
    private _logger?: Logger;

    /**
     * Creates a new chat handler
     * @param toolManager The tool manager
     * @param resourceManager The resource manager
     */
    constructor(
        private readonly toolManager: ToolManager,
        private readonly resourceManager: ResourceManager
    ) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }
    }

    /**
     * Handle chat requests
     * @param request The chat request
     * @param context The chat context
     * @param stream The response stream
     * @param token The cancellation token
     */
    public async handleRequest(
        request: vscode.ChatRequest, 
        context: vscode.ChatContext, 
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        try {
            if (this._logger) {
                this._logger.log(`Handling chat request: ${request.prompt}`);
            }
            
            // Handle special commands
            if (request.command === 'listResources') {
                return this._handleListResourcesCommand(stream);
            }
            
            // Get all available tools
            const tools = this.toolManager.getAllTools();
            
            if (this._logger) {
                this._logger.log(`Available tools for chat: ${tools.length}`);
            }
            
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
            ErrorHandler.handleError('Chat Request', error);
            
            // Return a fallback response
            stream.push(new vscode.ChatResponseMarkdownPart(
                new vscode.MarkdownString(`I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`)
            ));
            
            return {};
        }
    }

    /**
     * Handle the listResources command
     * @param stream The response stream
     */
    private async _handleListResourcesCommand(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        const resources = this.resourceManager.getAllResources();
        
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
            
            // Add a button to view the resource
            const command = `mcp-resource.${resource.name}`;
            markdown.appendMarkdown(`<a href="command:${command}">View Resource</a>`);
            
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
     * @param context The extension context
     * @returns The chat participant disposable
     */
    public static registerChatParticipant(
        context: vscode.ExtensionContext,
        toolManager: ToolManager,
        resourceManager: ResourceManager
    ): vscode.Disposable {
        const handler = new ChatHandler(toolManager, resourceManager);
        
        // Create chat participant
        const participant = vscode.chat.createChatParticipant(
            'copilot-mcp.mcp', 
            (request, context, stream, token) => handler.handleRequest(request, context, stream, token)
        );
        
        // Add followup provider
        participant.followupProvider = {
            provideFollowups(result, context, token) {
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
            },
        };
        
        return participant;
    }
} 