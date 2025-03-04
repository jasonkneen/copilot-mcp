import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

/**
 * Defines the tools that will be provided by the MCP server
 */
export class ServerTools {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Get the definitions of all tools to be registered with the MCP server
     * @returns An array of tool definitions
     */
    public getToolDefinitions(): Array<{
        name: string;
        description: string;
        handler: (args: any) => Promise<any>;
        inputSchema: any;
    }> {
        return [
            this.getEchoTool(),
            this.getWorkspaceInfoTool(),
            this.getOpenFileTool(),
            this.getRunCommandTool(),
            this.getFileSearchTool(),
        ];
    }

    /**
     * Echo tool that simply returns the input
     */
    private getEchoTool() {
        return {
            name: 'extension_echo',
            description: 'Echoes back the input provided',
            handler: async (args: { message: string }) => {
                this.logger.log(`[Echo Tool] Received message: ${args.message}`);
                return `Echo: ${args.message}`;
            },
            inputSchema: {
                type: 'object',
                properties: {
                    message: {
                        type: 'string',
                        description: 'The message to echo back',
                    },
                },
                required: ['message'],
            },
        };
    }

    /**
     * Workspace info tool that provides information about the current workspace
     */
    private getWorkspaceInfoTool() {
        return {
            name: 'vscode_workspaceInfo',
            description: 'Provides information about the current VS Code workspace',
            handler: async () => {
                this.logger.log('[Workspace Info Tool] Getting workspace info');
                
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const activeEditor = vscode.window.activeTextEditor;
                
                return {
                    workspaceFolders: workspaceFolders?.map(folder => ({
                        name: folder.name,
                        uri: folder.uri.toString(),
                    })) || [],
                    activeFile: activeEditor?.document.uri.toString() || null,
                    activeLanguage: activeEditor?.document.languageId || null,
                    extensions: vscode.extensions.all.map(ext => ({
                        id: ext.id,
                        isActive: ext.isActive,
                    })),
                };
            },
            inputSchema: {
                type: 'object',
                properties: {},
            },
        };
    }

    /**
     * Open file tool that opens a file in the editor
     */
    private getOpenFileTool() {
        return {
            name: 'vscode_openFile',
            description: 'Opens a file in the VS Code editor',
            handler: async (args: { path: string }) => {
                this.logger.log(`[Open File Tool] Opening file: ${args.path}`);
                
                try {
                    const document = await vscode.workspace.openTextDocument(args.path);
                    await vscode.window.showTextDocument(document);
                    return `File opened successfully: ${args.path}`;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.error(`[Open File Tool] Failed to open file: ${errorMessage}`);
                    throw new Error(`Failed to open file: ${errorMessage}`);
                }
            },
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path to the file to open',
                    },
                },
                required: ['path'],
            },
        };
    }

    /**
     * Run command tool that executes a VS Code command
     */
    private getRunCommandTool() {
        return {
            name: 'vscode_runCommand',
            description: 'Executes a VS Code command',
            handler: async (args: { command: string; args?: any[] }) => {
                this.logger.log(`[Run Command Tool] Running command: ${args.command}`);
                
                try {
                    const result = await vscode.commands.executeCommand(args.command, ...(args.args || []));
                    return {
                        success: true,
                        result: result !== undefined ? JSON.stringify(result) : 'Command executed successfully',
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.error(`[Run Command Tool] Failed to run command: ${errorMessage}`);
                    throw new Error(`Failed to run command: ${errorMessage}`);
                }
            },
            inputSchema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The VS Code command to execute',
                    },
                    args: {
                        type: 'array',
                        description: 'Arguments to pass to the command',
                        items: {
                            type: 'any',
                        },
                    },
                },
                required: ['command'],
            },
        };
    }

    /**
     * File search tool that searches for files in the workspace
     */
    private getFileSearchTool() {
        return {
            name: 'vscode_fileSearch',
            description: 'Searches for files in the workspace',
            handler: async (args: { pattern: string; maxResults?: number }) => {
                this.logger.log(`[File Search Tool] Searching for files with pattern: ${args.pattern}`);
                
                try {
                    const maxResults = args.maxResults || 100;
                    const files = await vscode.workspace.findFiles(args.pattern, null, maxResults);
                    
                    return {
                        count: files.length,
                        files: files.map(file => ({
                            path: file.fsPath,
                            uri: file.toString(),
                        })),
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.error(`[File Search Tool] Failed to search files: ${errorMessage}`);
                    throw new Error(`Failed to search files: ${errorMessage}`);
                }
            },
            inputSchema: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'The glob pattern to search for files',
                    },
                    maxResults: {
                        type: 'number',
                        description: 'Maximum number of results to return',
                    },
                },
                required: ['pattern'],
            },
        };
    }
}