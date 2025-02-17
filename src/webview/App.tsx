import React, { useState, useEffect } from 'react';
import './App.css';

interface ServerConfig {
    id: string;
    name: string;
    command: string;
    enabled: boolean;
}

interface Tool {
    name: string;
    description: string;
    inputSchema: any;
}

interface ServerWithTools extends ServerConfig {
    tools: Tool[];
}

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
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{isEditMode(props) ? 'Edit MCP Server' : 'Add MCP Server'}</h3>
                <form onSubmit={handleSubmit}>
                    {error && <div className="error-message">{error}</div>}
                    <div className="form-group">
                        <label htmlFor="server-name">Server Name:</label>
                        <input
                            id="server-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter server name"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="server-command">Start Command:</label>
                        <input
                            id="server-command"
                            type="text"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="Enter command to start the server"
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={props.onClose}>Cancel</button>
                        <button type="submit">{isEditMode(props) ? 'Save Changes' : 'Add Server'}</button>
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
                enabled: false
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

    const handleRemoveServer = (id: string) => {
        window.vscodeApi.postMessage({
            type: 'removeServer',
            id
        });
    };

    const handleToggleServer = (id: string, enabled: boolean) => {
        window.vscodeApi.postMessage({
            type: 'toggleServer',
            id,
            enabled
        });
    };

    return (
        <div className="mcp-server-manager">
            <header>
                <h2>MCP Server Manager</h2>
            </header>
            <div className="server-list">
                {servers.length === 0 ? (
                    <div className="empty-state">
                        No servers configured yet. Click "Add Server" to get started.
                    </div>
                ) : (
                    servers.map(server => (
                        <div key={server.id} className="server-item">
                            <div 
                                className="server-info"
                                onClick={() => setExpandedServer(
                                    expandedServer === server.id ? null : server.id
                                )}
                            >
                                <div className="server-header">
                                    <span className="server-name">{server.name}</span>
                                    <span className="server-command">{server.command}</span>
                                </div>
                                {server.enabled && server.tools.length > 0 && (
                                    <span className="tools-count">
                                        {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''} available
                                    </span>
                                )}
                            </div>
                            <div className="server-controls">
                                <input
                                    type="checkbox"
                                    checked={server.enabled}
                                    onChange={() => handleToggleServer(server.id, !server.enabled)}
                                />
                                <button
                                    className="edit-button"
                                    onClick={() => setEditingServer(server)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="remove-button"
                                    onClick={() => handleRemoveServer(server.id)}
                                >
                                    Remove
                                </button>
                            </div>
                            {expandedServer === server.id && server.tools.length > 0 && (
                                <div className="server-tools">
                                    <h4>Available Tools:</h4>
                                    <div className="tools-list">
                                        {server.tools.map(tool => (
                                            <div key={tool.name} className="tool-item">
                                                <div className="tool-header">
                                                    <span className="tool-name">{tool.name}</span>
                                                </div>
                                                <div className="tool-description">
                                                    {tool.description}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            <div className="actions">
                <button
                    className="add-button"
                    onClick={() => setIsAddModalOpen(true)}
                >
                    Add Server
                </button>
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