import React, { useState, useEffect } from 'react';
import './App.css';
import '@/styles/globals.css';
import { ServerConfig, ServerWithTools } from './types';
import { ServerCard } from './components/ServerCard';
import { Button } from '@/components/ui/button';
interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface AddServerModalProps extends BaseModalProps {
    mode: 'add';
    onSubmit: (name: string, command: string) => void;
}

interface EditServerModalProps extends BaseModalProps {
    mode: 'edit';
    server: ServerConfig;
    onSubmit: (id: string, name: string, command: string) => void;
}

type ServerModalProps = AddServerModalProps | EditServerModalProps;

declare global {
    interface Window {
        vscodeApi?: any;
    }
}

function isEditMode(props: ServerModalProps): props is EditServerModalProps {
    return props.mode === 'edit';
}

function ServerModal(props: ServerModalProps) {
    const [name, setName] = useState('');
    const [command, setCommand] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens/closes or server changes
    useEffect(() => {
        if (props.isOpen && isEditMode(props)) {
            setName(props.server.name);
            setCommand(props.server.command);
        } else if (!props.isOpen) {
            setName('');
            setCommand('');
            setError(null);
        }
    }, [props.isOpen, isEditMode(props) ? props.server : null]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate inputs
        if (!name.trim()) {
            setError('Server name is required');
            return;
        }
        if (!command.trim()) {
            setError('Command is required');
            return;
        }

        if (isEditMode(props)) {
            props.onSubmit(props.server.id, name.trim(), command.trim());
        } else {
            props.onSubmit(name.trim(), command.trim());
        }
        
        setError(null);
        props.onClose();
    };

    if (!props.isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="w-full max-w-md p-6 rounded-lg bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] text-[var(--vscode-editor-foreground)]">
                <h3 className="text-xl font-semibold mb-4">
                    {isEditMode(props) ? 'Edit MCP Server' : 'Add MCP Server'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded bg-[var(--vscode-errorForeground)]/10 text-[var(--vscode-errorForeground)] text-sm">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <label htmlFor="server-name" className="text-sm font-medium block">
                            Server Name:
                        </label>
                        <input
                            id="server-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter server name"
                            className="w-full p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="server-command" className="text-sm font-medium block">
                            Start Command:
                        </label>
                        <input
                            id="server-command"
                            type="text"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="Enter command to start the server"
                            className="w-full p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
                        />
                    </div>
                    <div className="flex justify-end space-x-2 mt-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={props.onClose}
                            className="hover:bg-[var(--vscode-button-hoverBackground)]"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)]"
                        >
                            {isEditMode(props) ? 'Save Changes' : 'Add Server'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function App() {
    const [servers, setServers] = useState<ServerWithTools[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    useEffect(() => {
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'setServers':
                    setServers(message.servers.map((server: ServerConfig) => ({
                        ...server,
                        tools: []
                    })));
                    break;
                case 'updateServer':
                    setServers(current => 
                        current.map(server => 
                            server.id === message.server.id 
                                ? { ...message.server, tools: message.tools || [] }
                                : server
                        )
                    );
                    break;
                case 'updateServerTools':
                    setServers(current =>
                        current.map(server =>
                            server.id === message.serverId
                                ? { ...server, tools: message.tools }
                                : server
                        )
                    );
                    break;
            }
        });

        // Request initial server list
        window.vscodeApi.postMessage({ type: 'getServers' });
    }, []);

    const handleAddServer = (name: string, command: string) => {
        window.vscodeApi.postMessage({
            type: 'addServer',
            server: {
                name,
                command,
                enabled: true
            }
        });
    };

    const handleEditServer = (id: string, name: string, command: string) => {
        window.vscodeApi.postMessage({
            type: 'editServer',
            server: {
                id,
                name,
                command
            }
        });
        setEditingServer(null);
    };

    return (
        <div className="flex flex-col min-h-screen p-4 bg-[var(--vscode-panel-background)]">
            <header className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--vscode-editor-foreground)]">MCP Server Manager</h2>
            </header>
            <div className="flex-1 w-full max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servers.length === 0 ? (
                        <div className="col-span-full p-6 text-center rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] text-[var(--vscode-descriptionForeground)]">
                            No servers configured yet. Click "Add Server" to get started.
                        </div>
                    ) : (
                        servers.map(server => (
                            <ServerCard
                                className='bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded'
                                key={server.id}
                                server={server}
                            />
                        ))
                    )}
                </div>
            </div>
            <div className="mt-6 flex justify-end">
                <Button
                    className="bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)]"
                    onClick={() => setIsAddModalOpen(true)}
                >
                    Add Server
                </Button>
            </div>
            <ServerModal
                mode="add"
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleAddServer}
            />
            {editingServer && (
                <ServerModal
                    mode="edit"
                    isOpen={true}
                    onClose={() => setEditingServer(null)}
                    onSubmit={handleEditServer}
                    server={editingServer}
                />
            )}
        </div>
    );
}

