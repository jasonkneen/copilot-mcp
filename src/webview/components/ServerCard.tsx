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

import { ServerConfig, ServerWithTools } from "../types";

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
    const [editCommand, setEditCommand] = useState(server.command);
    const [editEnvVars, setEditEnvVars] = useState<{ key: string; value: string }[]>([]);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');

    useEffect(() => {
        // Convert env object to array when editing starts
        if (isEditing && server.env) {
            setEditEnvVars(Object.entries(server.env).map(([key, value]) => ({ key, value })));
        } else {
            setEditEnvVars([]);
            setNewEnvKey('');
            setNewEnvValue('');
        }
    }, [isEditing, server.env]);

    const handleEditServer = (name: string, command: string, envVars: { key: string; value: string }[]) => {
        // Convert envVars array to object
        const env = envVars.reduce((acc, { key, value }) => {
            if (key.trim()) {
                acc[key.trim()] = value;
            }
            return acc;
        }, {} as { [key: string]: string });

        window.vscodeApi.postMessage({
            type: 'editServer',
            server: {
                id: server.id,
                name,
                command,
                env
            }
        });
        setIsEditing(false);
    };

    const handleSave = () => {
        if (editName.trim() && (editCommand?.trim() || '')) {
            handleEditServer(editName.trim(), editCommand?.trim() || '', editEnvVars);
        }
    };

    const handleCancel = () => {
        setEditName(server.name);
        setEditCommand(server.command);
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

    return (
        <Card className={cn("w-full h-full flex flex-col text-[var(--vscode-editor-foreground)]", className)}>
            <CardHeader className="relative flex-shrink-0">
                {isEditing ? (
                    <div className="space-y-2 w-full pr-12">
                        <div className="absolute right-4 top-4 flex gap-2">
                            <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={handleCancel}
                                className="hover:bg-[var(--vscode-button-hoverBackground)]"
                            >
                                ×
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={handleSave}
                                className="hover:bg-[var(--vscode-button-hoverBackground)]"
                            >
                                <Save className="h-4 w-4" />
                            </Button>
                        </div>
                        <Input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="font-semibold w-full bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                        />
                        <Input
                            type="text"
                            value={editCommand}
                            onChange={(e) => setEditCommand(e.target.value)}
                            className="text-sm w-full text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-input-background)] border-[var(--vscode-input-border)]"
                        />
                    </div>
                ) : (
                    <>
                        <Button 
                            variant="ghost" 
                            size="icon"
                            className="absolute right-4 top-4 hover:bg-[var(--vscode-button-hoverBackground)]"
                            onClick={() => setIsEditing(true)}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <CardTitle className="text-[var(--vscode-editor-foreground)] pr-12">{server.name}</CardTitle>
                        <CardDescription className="text-[var(--vscode-descriptionForeground)] break-words">{server.command}</CardDescription>
                    </>
                )}
            </CardHeader>
            <CardContent className="grid gap-4 flex-1">
                <span className="w-full flex justify-between items-center text-[var(--vscode-descriptionForeground)]">
                    <span>{server.tools?.length} tool{server.tools?.length !== 1 ? 's' : ''} available</span>
                </span>

                <div className="flex-1 overflow-auto">
                    {server.tools?.map((tool, index) => (
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
                                    </CollapsibleContent>
                                </div>
                            </div>
                        </Collapsible>
                    ))}
                </div>

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

                <div className="flex items-center space-x-4 rounded-md border border-[var(--vscode-widget-border)] p-4 bg-[var(--vscode-editor-background)]">
                    <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none text-[var(--vscode-editor-foreground)]">
                            Enable
                        </p>
                        <p className="text-sm text-[var(--vscode-descriptionForeground)]">
                            Enable this tool to use it with the MCP Agent in GitHub Copilot chat.
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
