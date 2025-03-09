import { FileTree } from '@vscode/chat-extension-utils';
import { AssistantMessage, BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
interface IMCPPromptProps extends BasePromptElementProps {
	workspaceRoots: vscode.WorkspaceFolder[];
}

export class MCPPrompt extends PromptElement<IMCPPromptProps> {
	render() {
        if (this.props.workspaceRoots.length === 0) {
            return (
                <AssistantMessage priority={100}>
                    You are a helpful assistant. The user is not currently working in a workspace.
                    If they ask you to do something, you should ask them to open a folder first.
                </AssistantMessage>
            );
        } else if (this.props.workspaceRoots.length === 1) {
            return (
                <AssistantMessage priority={100}>
                    You are a helpful assistant. The user is currently working in the folder: {this.props.workspaceRoots[0].uri.fsPath}.
                    Here is the file tree of the workspace:
                    <FileTree root={this.props.workspaceRoots[0].uri} ignore={uris => uris.filter(uri => uri.path.includes('node_modules'))} />
                </AssistantMessage>
            );
        }
		return (
			<>
				<AssistantMessage priority={100}>
					You are a helpful assistant. The user currently has multiple workspaces open. Here is the file tree of each workspace:
					{this.props.workspaceRoots.map(workspace => (
						<>
                            {workspace.index + 1}. {workspace.uri.scheme}://{workspace.uri.fsPath}:
							<FileTree root={workspace.uri} ignore={uris => uris.filter(uri => uri.path.includes('node_modules'))} />
							<br />
						</>
					))}
				</AssistantMessage>
			</>
		);
	}
}
