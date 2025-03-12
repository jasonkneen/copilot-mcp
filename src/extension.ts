import * as vscode from 'vscode';
// Import our architectural components
import { ServerViewProvider } from '@/ui/ServerViewProvider';
import { ServerConfig } from '@/server/ServerConfig';
import { registerServerAndClients } from '@/toolInitHelpers';
import { Credentials } from '@/lib/Github';

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
    const credentials = new Credentials();
    await credentials.initialize(context);
    let octo = await credentials.getOctokit();
    // console.log('Octo:', octo.actions.);
    console.log('Workspace folders:', vscode.workspace.workspaceFolders);
    console.log('Starting activation of copilot-mcp extension...');

    try {
        console.log('Initializing extension...');

        // Get servers from configuration
        const config = vscode.workspace.getConfiguration('mcpManager');
        const servers = config.get<ServerConfig[]>('servers', []);
        console.log(`Servers: ${JSON.stringify(servers)}`);
        const clients = await registerServerAndClients(servers, context);
        // Register the WebView Provider using our ServerViewProvider class
        await ServerViewProvider.createOrShow(context, clients);

        console.log('copilot-mcp extension activated successfully');

        registerVscodeEvents(context);
    } catch (error) {
        console.debug(`Error during extension activation: ${error}`);
        vscode.window.showErrorMessage(`Failed to activate the extension: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

const registerVscodeEvents = (context: vscode.ExtensionContext) => {
    const configSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('mcpManager',)) {
            console.log('Servers configuration changed, triggering reload');
            // reload the extension
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    });
    context.subscriptions.push(configSubscription);

    // Register the openServerManager command
    const openManagerCommand = vscode.commands.registerCommand('copilot-mcp.openServerManager', async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.mcpServers');
        } catch (error) {
            console.warn(`Failed to open server manager: ${error}`);
        }
    });
    context.subscriptions.push(openManagerCommand);
};
// This method is called when your extension is deactivated
export function deactivate() {
    try {
        console.log('Deactivating MCP extension...');

        // The components will be disposed through the context subscriptions
        // Nothing extra to do here for now

        console.log('MCP extension deactivated successfully');
    } catch (error) {
        console.error('Error during extension deactivation:', error);
    }
}

