import { Tool } from "@modelcontextprotocol/sdk/types";
import * as vscode from 'vscode';
export async function updateTools(view: vscode.WebviewView, serverName: string, tools: Tool[]): Promise<boolean> {
    if (!view) {
        console.error('View is not available');
        return false;
    }
    const result = await view.webview.postMessage({
        type: 'updateServerTools',
        name: serverName,
        tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }))
    });
    return result;
}