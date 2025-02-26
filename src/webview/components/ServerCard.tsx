import React, { useState, useEffect } from "react";
import { Pencil, Save, Trash } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

import { ServerConfig, ServerWithTools, ServerType } from "../types";

type ServerCardProps = React.ComponentProps<typeof Card> & {
    server: ServerWithTools
}

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

export const ServerCard = ({ className, server }: ServerCardProps) => {
    const [expandedTool, setExpandedTool] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(server.name);
    const [editType, setEditType] = useState<ServerType>(server.type || ServerType.PROCESS);
    const [editCommand, setEditCommand] = useState(server.command || '');
    const [editUrl, setEditUrl] = useState(server.url || '');
    const [editAuthToken, setEditAuthToken] = useState(server.authToken || '');
    const [editEnvVars, setEditEnvVars] = useState<{ key: string; value: string }[]>([]);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        // Reset edit fields when server changes or editing starts
        if (isEditing) {
            setEditName(server.name);
            setEditType(server.type || ServerType.PROCESS);
            setEditCommand(server.command || '');
            setEditUrl(server.url || '');
            setEditAuthToken(server.authToken || '');
            
            // Convert env object to array when editing starts
            if (server.env) {
                setEditEnvVars(Object.entries(server.env).map(([key, value]) => ({ key, value })));
            } else {
                setEditEnvVars([]);
            }
        }
        
        setNewEnvKey('');
        setNewEnvValue('');
    }, [isEditing, server]);

    const handleEditServer = () => {
        // If not in edit mode, switch to edit mode
        if (!isEditing) {
            setIsEditing(true);
            return;
        }

        // Otherwise, save the changes
        // Validate required fields
        if (!editName.trim()) {
            alert('Server name is required');
            return;
        }

        if (editType === ServerType.PROCESS && !editCommand.trim()) {
            alert('Command is required for process servers');
            return;
        }

        if (editType === ServerType.SSE && !editUrl.trim()) {
            alert('URL is required for SSE servers');
            return;
        }

        // Create updates object based on server type
        let updates: any = {
            id: server.id,
            name: editName.trim(),
            type: editType,
        };

        if (editType === ServerType.PROCESS) {
            // Convert editEnvVars array to object
            const env = editEnvVars.reduce((acc, { key, value }) => {
                if (key.trim()) {
                    acc[key.trim()] = value;
                }
                return acc;
            }, {} as { [key: string]: string });

            updates = {
                ...updates,
                command: editCommand.trim(),
                env
            };
        } else {
            updates = {
                ...updates,
                url: editUrl.trim(),
                authToken: editAuthToken
            };
        }

        // Send update to VS Code
        window.vscodeApi.postMessage({
            type: 'editServer',
            server: updates
        });

        // Exit edit mode
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditName(server.name);
        setEditType(server.type || ServerType.PROCESS);
        setEditCommand(server.command || '');
        setEditUrl(server.url || '');
        setEditAuthToken(server.authToken || '');
        setEditEnvVars([]);
        setIsEditing(false);
    };

    const handleAddNewEnvVar = () => {
        if (newEnvKey.trim()) {
            setEditEnvVars([...editEnvVars, { key: newEnvKey.trim(), value: newEnvValue }]);
            setNewEnvKey('');
            setNewEnvValue('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newEnvKey.trim()) {
            handleAddNewEnvVar();
        }
    };

    const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
        const newEnvVars = [...editEnvVars];
        newEnvVars[index][field] = value;
        setEditEnvVars(newEnvVars);
    };

    const removeEnvVar = (index: number) => {
        setEditEnvVars(editEnvVars.filter((_, i) => i !== index));
    };

    // Helper function to safely render tool settings
    const renderToolSettings = (settings: any): string => {
        if (!settings) return '';
        
        try {
            if (typeof settings === 'object') {
                return JSON.stringify(settings, null, 2);
            } else {
                return String(settings);
            }
        } catch (e) {
            return 'Error displaying settings';
        }
    };

    // Helper to render server details based on type
    const renderServerDetails = () => {
        // Ensure server type has a value, defaulting to PROCESS
        const serverType = server.type || ServerType.PROCESS;
        
        if (isEditing) {
            return (
                <div className="space-y-4 mt-4">
                    <div>
                        <label htmlFor={`server-name-${server.id}`} className="text-sm font-medium block mb-1">
                            Server Name:
                        </label>
                        <Input
                            id={`server-name-${server.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium block mb-1">
                            Server Type:
                        </label>
                        <div className="flex space-x-4">
                            <label className="flex items-center space-x-2">
                                <input
                                    type="radio"
                                    checked={editType === ServerType.PROCESS}
                                    onChange={() => setEditType(ServerType.PROCESS)}
                                    className="accent-[var(--vscode-button-background)]"
                                />
                                <span className="text-sm">Process</span>
                            </label>
                            <label className="flex items-center space-x-2">
                                <input
                                    type="radio"
                                    checked={editType === ServerType.SSE}
                                    onChange={() => setEditType(ServerType.SSE)}
                                    className="accent-[var(--vscode-button-background)]"
                                />
                                <span className="text-sm">SSE</span>
                            </label>
                        </div>
                    </div>

                    {editType === ServerType.PROCESS ? (
                        <>
                            <div>
                                <label htmlFor={`server-command-${server.id}`} className="text-sm font-medium block mb-1">
                                    Start Command:
                                </label>
                                <Input
                                    id={`server-command-${server.id}`}
                                    value={editCommand}
                                    onChange={(e) => setEditCommand(e.target.value)}
                                    className="w-full bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-medium">Environment Variables:</label>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        onClick={handleAddNewEnvVar}
                                        size="sm"
                                        className="text-xs"
                                    >
                                        Add Variable
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {editEnvVars.map((envVar, index) => (
                                        <div key={index} className="flex gap-2">
                                            <Input
                                                value={envVar.key}
                                                onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                                                placeholder="KEY"
                                                className="flex-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                            />
                                            <Input
                                                value={envVar.value}
                                                onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                                                placeholder="value"
                                                className="flex-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => removeEnvVar(index)}
                                                size="sm"
                                                className="px-2"
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
                            <div>
                                <label htmlFor={`server-url-${server.id}`} className="text-sm font-medium block mb-1">
                                    Server URL:
                                </label>
                                <Input
                                    id={`server-url-${server.id}`}
                                    value={editUrl}
                                    onChange={(e) => setEditUrl(e.target.value)}
                                    className="w-full bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                />
                            </div>
                            <div>
                                <label htmlFor={`auth-token-${server.id}`} className="text-sm font-medium block mb-1">
                                    Authentication Token (optional):
                                </label>
                                <Input
                                    id={`auth-token-${server.id}`}
                                    type="password"
                                    value={editAuthToken}
                                    onChange={(e) => setEditAuthToken(e.target.value)}
                                    className="w-full bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                />
                            </div>
                        </>
                    )}

                    <div className="flex justify-end space-x-2 mt-6">
                        <Button
                            variant="ghost"
                            onClick={handleCancel}
                            size="sm"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleEditServer}
                            size="sm"
                        >
                            Save
                        </Button>
                    </div>
                </div>
            );
        } else {
            return (
                <div className="space-y-2 mt-4">
                    <div>
                        <span className="text-sm text-[var(--vscode-descriptionForeground)]">Type:</span>
                        <Badge variant="outline" className="ml-2">
                            {(server.type || ServerType.PROCESS) === ServerType.SSE ? 'SSE' : 'Process'}
                        </Badge>
                    </div>
                    
                    {(server.type || ServerType.PROCESS) === ServerType.PROCESS ? (
                        <>
                            <div>
                                <span className="text-sm text-[var(--vscode-descriptionForeground)]">Command:</span>
                                <div className="mt-1 px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto">
                                    {server.command}
                                </div>
                            </div>
                            
                            {server.env && Object.keys(server.env).length > 0 && (
                                <div>
                                    <span className="text-sm text-[var(--vscode-descriptionForeground)]">Environment Variables:</span>
                                    <div className="mt-1 grid grid-cols-2 gap-1">
                                        {Object.entries(server.env).map(([key, value]) => (
                                            <div key={key} className="col-span-2 grid grid-cols-2">
                                                <div className="font-mono text-xs px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded-l truncate">
                                                    {key}
                                                </div>
                                                <div className="font-mono text-xs px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded-r truncate">
                                                    {value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div>
                                <span className="text-sm text-[var(--vscode-descriptionForeground)]">URL:</span>
                                <div className="mt-1 px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto">
                                    {server.url}
                                </div>
                            </div>
                            
                            {server.authToken && (
                                <div>
                                    <span className="text-sm text-[var(--vscode-descriptionForeground)]">Authentication:</span>
                                    <div className="mt-1 px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto">
                                        •••••••••••••••
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    
                    <div className="flex justify-end space-x-2 mt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setIsEditing(true)}
                            size="sm"
                        >
                            Edit
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => handleRemoveServer(server.id)}
                            size="sm"
                        >
                            Remove
                        </Button>
                    </div>
                </div>
            );
        }
    };

    return (
        <Card className={cn("w-full h-full flex flex-col text-[var(--vscode-editor-foreground)]", className)}>
            <CardHeader className="relative flex-shrink-0">
                {renderServerDetails()}
            </CardHeader>
            <CardContent className="grid gap-4 flex-1">
                <span className="w-full flex justify-between items-center text-[var(--vscode-descriptionForeground)]">
                    <span>{server.tools?.length} tool{server.tools?.length !== 1 ? 's' : ''} available</span>
                </span>

                <div className="flex-1 overflow-auto">
                    {server.tools?.map((tool): React.ReactNode => (
                        <Collapsible
                            key={tool.name}
                            open={expandedTool === tool.name}
                            onOpenChange={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                        >
                            <div className="mb-4 grid grid-cols-1 items-start pb-4 last:mb-0 last:pb-0">
                                <div className="space-y-2 w-full">
                                    <CollapsibleTrigger asChild>
                                        <p className="text-sm font-medium leading-none text-[var(--vscode-editor-foreground)] cursor-pointer hover:opacity-80">
                                            {tool.name}
                                        </p>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2">
                                        <p className="text-sm text-[var(--vscode-descriptionForeground)] break-words pl-4 border-l-2 border-[var(--vscode-widget-border)]">
                                            {tool.description}
                                        </p>
                                        {/* {tool.settings && (
                                            <div className="text-xs mt-1 font-mono pl-4 border-l-2 border-[var(--vscode-widget-border)]">
                                                {renderToolSettings(tool)}
                                            </div>
                                        )} */}
                                    </CollapsibleContent>
                                </div>
                            </div>
                        </Collapsible>
                    ))}
                </div>

                {(server.type || ServerType.PROCESS) === ServerType.PROCESS && (
                    <div className="mt-4 p-4 rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)]">
                        <p className="text-sm font-medium mb-2">Environment Variables:</p>
                        {isEditing ? (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        placeholder="KEY"
                                        value={newEnvKey}
                                        onChange={(e) => setNewEnvKey(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        className="flex-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                    />
                                    <Input
                                        type="text"
                                        placeholder="value"
                                        value={newEnvValue}
                                        onChange={(e) => setNewEnvValue(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        className="flex-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={handleAddNewEnvVar}
                                        className="hover:bg-[var(--vscode-button-hoverBackground)]"
                                    >
                                        +
                                    </Button>
                                </div>
                                {editEnvVars.map((envVar, index) => (
                                    <div key={index} className="flex gap-2">
                                        <Input
                                            type="text"
                                            value={envVar.key}
                                            onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                                            placeholder="KEY"
                                            className="flex-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                        />
                                        <Input
                                            type="text"
                                            value={envVar.value}
                                            onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                                            placeholder="value"
                                            className="flex-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
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
                        ) : (
                            server.env && Object.keys(server.env).length > 0 ? (
                                <div className="space-y-1">
                                    {Object.entries(server.env).map(([key, value]) => (
                                        <div key={key} className="text-sm text-[var(--vscode-descriptionForeground)]">
                                            <span className="font-medium">{key}</span>: {value}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-[var(--vscode-descriptionForeground)]">
                                    No environment variables configured
                                </p>
                            )
                        )}
                    </div>
                )}

                <div className="flex items-center space-x-4 rounded-md border border-[var(--vscode-widget-border)] p-4 bg-[var(--vscode-editor-background)]">
                    <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none text-[var(--vscode-editor-foreground)]">
                            Enable
                        </p>
                        <p className="text-sm text-[var(--vscode-descriptionForeground)]">
                            Enable this server to use it with the MCP Agent in GitHub Copilot chat.
                        </p>
                    </div>
                    <Switch 
                        checked={server.enabled} 
                        onCheckedChange={(checked) => handleToggleServer(server.id, checked)}
                        className="bg-[var(--vscode-button-background)] data-[state=checked]:bg-[var(--vscode-button-background)]"
                    />
                </div>
            </CardContent>
            <CardFooter className="flex-shrink-0">
                <Button 
                    className="w-full bg-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)] hover:opacity-90" 
                    variant="destructive" 
                    onClick={() => handleRemoveServer(server.id)}
                >
                    <Trash className="mr-2" /> Remove
                </Button>
            </CardFooter>
        </Card>
    )
}
