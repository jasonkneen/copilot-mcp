import React, { useState, useEffect } from 'react';
import './App.css';
import '@/styles/globals.css';
import { ServerConfig, ServerWithTools, ServerType } from './types';
import { ServerCard } from './components/ServerCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface AddServerModalProps extends BaseModalProps {
    onSubmit: (server: {
        name: string;
        type: ServerType;
        command?: string;
        url?: string;
        authToken?: string;
        enabled?: boolean;
        env?: { [key: string]: string };
    }) => void;
}

type ServerModalProps = AddServerModalProps;

declare global {
    interface Window {
        vscodeApi?: any;
    }
}

function ServerModal(props: ServerModalProps) {
    const [name, setName] = useState('');
    const [serverType, setServerType] = useState<ServerType>(ServerType.PROCESS);
    const [command, setCommand] = useState('');
    const [url, setUrl] = useState('');
    const [authToken, setAuthToken] = useState('');
    const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (!props.isOpen) {
            setName('');
            setServerType(ServerType.PROCESS);
            setCommand('');
            setUrl('');
            setAuthToken('');
            setEnvVars([]);
            setError(null);
        }
    }, [props.isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate inputs
        if (!name.trim()) {
            setError('Server name is required');
            return;
        }
        
        if (serverType === ServerType.PROCESS && !command.trim()) {
            setError('Command is required for process servers');
            return;
        }
        
        if (serverType === ServerType.SSE && !url.trim()) {
            setError('URL is required for SSE servers');
            return;
        }

        // Convert envVars array to object (only needed for PROCESS servers)
        const env = envVars.reduce((acc, { key, value }) => {
            if (key.trim()) {
                acc[key.trim()] = value;
            }
            return acc;
        }, {} as { [key: string]: string });

        // Create the server object with appropriate fields based on type
        const server = {
            name: name.trim(),
            type: serverType,
            enabled: true,
            ...(serverType === ServerType.PROCESS ? { 
                command: command.trim(),
                env 
            } : { 
                url: url.trim(),
                ...(authToken ? { authToken } : {})
            })
        };

        props.onSubmit(server);
        
        setError(null);
        props.onClose();
    };

    const addEnvVar = () => {
        setEnvVars([...envVars, { key: '', value: '' }]);
    };

    const removeEnvVar = (index: number) => {
        setEnvVars(envVars.filter((_, i) => i !== index));
    };

    const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
        const newEnvVars = [...envVars];
        newEnvVars[index][field] = value;
        setEnvVars(newEnvVars);
    };

    if (!props.isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="w-full max-w-md p-6 rounded-lg bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] text-[var(--vscode-editor-foreground)]">
                <h3 className="text-xl font-semibold mb-4">
                    Add MCP Server
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
                        <label className="text-sm font-medium block">
                            Server Type:
                        </label>
                        <div className="flex space-x-4">
                            <label className="flex items-center space-x-2">
                                <input
                                    type="radio"
                                    checked={serverType === ServerType.PROCESS}
                                    onChange={() => setServerType(ServerType.PROCESS)}
                                    className="accent-[var(--vscode-button-background)]"
                                />
                                <span className="text-sm">Process</span>
                            </label>
                            <label className="flex items-center space-x-2">
                                <input
                                    type="radio"
                                    checked={serverType === ServerType.SSE}
                                    onChange={() => setServerType(ServerType.SSE)}
                                    className="accent-[var(--vscode-button-background)]"
                                />
                                <span className="text-sm">SSE</span>
                            </label>
                        </div>
                    </div>
                    
                    {serverType === ServerType.PROCESS ? (
                        <>
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
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium">Environment Variables:</label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={addEnvVar}
                                        className="text-sm hover:bg-[var(--vscode-button-hoverBackground)]"
                                    >
                                        Add Variable
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {envVars.map((envVar, index) => (
                                        <div key={index} className="flex gap-2">
                                            <Input
                                                type="text"
                                                value={envVar.key}
                                                onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                                                placeholder="KEY"
                                                className="flex-1 p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
                                            />
                                            <Input
                                                type="text"
                                                value={envVar.value}
                                                onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                                                placeholder="value"
                                                className="flex-1 p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => removeEnvVar(index)}
                                                className="hover:bg-[var(--vscode-errorForeground)]/10"
                                            >
                                                ×
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label htmlFor="server-url" className="text-sm font-medium block">
                                    Server URL:
                                </label>
                                <input
                                    id="server-url"
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="Enter SSE server URL"
                                    className="w-full p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="auth-token" className="text-sm font-medium block">
                                    Authentication Token (optional):
                                </label>
                                <input
                                    id="auth-token"
                                    type="password"
                                    value={authToken}
                                    onChange={(e) => setAuthToken(e.target.value)}
                                    placeholder="Enter authentication token if required"
                                    className="w-full p-2 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:ring-2 focus:ring-[var(--vscode-focusBorder)]"
                                />
                            </div>
                        </>
                    )}
                    
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
                            Add Server
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const handleWebviewMessage = (event: MessageEvent) => {
    const message = event.data;
    switch (message.type) {
        case 'setServers':
            console.log('Setting servers:', message.servers);
            return message.servers;
        case 'updateServer':
            return (current: ServerWithTools[]) => 
                current.map(server => 
                    server.id === message.server.id 
                        ? { ...message.server, tools: message.tools || server.tools }
                        : server
                );
        case 'updateServerTools':
            return (current: ServerWithTools[]) =>
                current.map(server =>
                    server.id === message.serverId
                        ? { ...server, tools: message.tools }
                        : server
                );
        default:
            return undefined;
    }
};

export function App() {
    const [servers, setServers] = useState<ServerWithTools[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);
    const [filterQuery, setFilterQuery] = useState('');

    useEffect(() => {
        // Listen for messages from the extension
        const messageHandler = (event: MessageEvent) => {
            const result = handleWebviewMessage(event);
            if (typeof result === 'function') {
                setServers(result);
            } else if (Array.isArray(result)) {
                setServers(result);
            }
        };

        window.addEventListener('message', messageHandler);

        // Request initial server list
        window.vscodeApi.postMessage({ type: 'getServers' });

        return () => {
            window.removeEventListener('message', messageHandler);
        }
    }, []);

    const handleAddServer = (server: {
        name: string;
        type: ServerType;
        command?: string;
        url?: string;
        authToken?: string;
        enabled?: boolean;
        env?: { [key: string]: string };
    }) => {
        window.vscodeApi.postMessage({
            type: 'addServer',
            server
        });
    };

    const filteredServers = servers.filter(server => 
        server.name.toLowerCase().includes(filterQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col min-h-screen p-4 bg-[var(--vscode-panel-background)]">
            <header className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--vscode-editor-foreground)]">MCP Server Manager</h2>
            </header>
            <div className="flex justify-between items-center mb-4">
                <div className="relative flex-1 max-w-md">
                    <Input
                        type="text"
                        placeholder="Filter servers..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="w-full bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                    />
                    {filterQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilterQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-[var(--vscode-button-hoverBackground)]"
                        >
                            ×
                        </Button>
                    )}
                </div>
                <Button
                    className="ml-4 bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)]"
                    onClick={() => setIsAddModalOpen(true)}
                >
                    Add Server
                </Button>
            </div>
            <div className="flex-1 w-full max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredServers.length === 0 ? (
                        <div className="col-span-full p-6 text-center rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] text-[var(--vscode-descriptionForeground)]">
                            {servers.length === 0 
                                ? 'No servers configured yet. Click "Add Server" to get started.'
                                : 'No servers match your filter criteria.'
                            }
                        </div>
                    ) : (
                        filteredServers.map(server => (
                            <ServerCard
                                className='bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)] rounded'
                                key={server.id}
                                server={server}
                            />
                        ))
                    )}
                </div>
            </div>
            <ServerModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleAddServer}
            />
        </div>
    );
}

