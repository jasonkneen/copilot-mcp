import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Edit, MoreHorizontal, Trash, Terminal, Globe, Server, Power } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
    const [showTools, setShowTools] = useState(false);
    const [showEnvVars, setShowEnvVars] = useState(false);

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
            setIsExpanded(true);
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

    // Enhanced compact view of the server card
    const renderCompactView = () => {
        const serverType = server.type || ServerType.PROCESS;
        const TypeIcon = serverType === ServerType.SSE ? Globe : Terminal;
        
        return (
            <div className="flex items-center justify-between w-full group py-0.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Left side chevron indicator for expandability */}
                    <div className="flex items-center justify-center w-4 h-4 flex-shrink-0">
                        <ChevronRight 
                            className={cn(
                                "h-3 w-3 text-[var(--vscode-descriptionForeground)] transition-transform duration-200",
                                isExpanded && "rotate-90 text-[var(--vscode-focusBorder)]"
                            )} 
                        />
                    </div>
                    
                    {/* Server icon with enabled/disabled state */}
                    <div className="flex items-center justify-center w-4 h-4 flex-shrink-0">
                        <TypeIcon 
                            size={14} 
                            className={cn(
                                server.enabled 
                                    ? "text-[var(--vscode-debugIcon-startForeground)]" 
                                    : "text-[var(--vscode-descriptionForeground)]"
                            )} 
                        />
                    </div>
                    
                    {/* Server name and details */}
                    <div className="flex-1 min-w-0 mr-2">
                        <h3 className="text-sm font-medium truncate leading-tight">
                            {server.name}
                        </h3>
                        <p className="text-xs text-[var(--vscode-descriptionForeground)] truncate leading-tight">
                            {serverType === ServerType.PROCESS ? 
                                server.command : 
                                server.url}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Server badge with type and tools count */}
                    <Badge 
                        variant={server.enabled ? "default" : "outline"} 
                        className={cn(
                            "text-2xs font-normal px-1.5 py-0.5 h-5 flex items-center",
                            server.enabled 
                                ? "bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] hover:bg-[var(--vscode-badge-background)]" 
                                : "text-[var(--vscode-descriptionForeground)] border-[var(--vscode-widget-border)]"
                        )}
                    >
                        {serverType === ServerType.SSE ? 'SSE' : 'Process'} • {server.tools?.length || 0}
                    </Badge>
                </div>
            </div>
        );
    };

    // Enhanced expanded details for the server
    const renderExpandedDetails = () => {
        const serverType = server.type || ServerType.PROCESS;
        
        return (
            <div className="space-y-3 mt-3 pt-3 border-t border-[var(--vscode-widget-border)] animate-in fade-in-50 duration-200">
                {/* Server Information */}
                <div className="space-y-2">
                    <h4 className="text-xs font-medium uppercase text-[var(--vscode-descriptionForeground)]">Server Info</h4>
                    
                    {/* Two column grid for server details - Label: Value format */}
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm items-center">
                        <span className="text-[var(--vscode-descriptionForeground)]">Type:</span>
                        <Badge 
                            variant="outline" 
                            className="w-fit justify-self-start border-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]"
                        >
                            {serverType === ServerType.SSE ? 'SSE' : 'Process'}
                        </Badge>
                        
                        {serverType === ServerType.PROCESS ? (
                            <>
                                <span className="text-[var(--vscode-descriptionForeground)]">Command:</span>
                                <div className="px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto">
                                    {server.command}
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="text-[var(--vscode-descriptionForeground)]">URL:</span>
                                <div className="px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto">
                                    {server.url}
                                </div>
                                
                                {server.authToken && (
                                    <>
                                        <span className="text-[var(--vscode-descriptionForeground)]">Auth:</span>
                                        <div className="px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs">
                                            •••••••••••••••
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
                
                {/* Tools Section - Styled like VSCode's native lists */}
                {server.tools && server.tools.length > 0 && (
                    <Collapsible 
                        open={showTools} 
                        onOpenChange={setShowTools} 
                        className="w-full transition-all duration-200"
                    >
                        <div className="flex items-center hover:bg-[var(--vscode-list-hoverBackground)] rounded px-1">
                            <CollapsibleTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="p-0 h-6 w-6 hover:bg-transparent"
                                >
                                    <ChevronRight className={cn(
                                        "h-4 w-4 transition-transform duration-200",
                                        showTools && "rotate-90"
                                    )} />
                                </Button>
                            </CollapsibleTrigger>
                            <h4 className="text-xs font-medium text-[var(--vscode-editor-foreground)] ml-1">
                                Available Tools ({server.tools.length})
                            </h4>
                        </div>
                        
                        <CollapsibleContent className="mt-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                            <div className="space-y-0.5 pl-6">
                                {server.tools.map((tool) => (
                                    <Collapsible
                                        key={tool.name}
                                        open={expandedTool === tool.name}
                                        onOpenChange={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                                        className="transition-all duration-150"
                                    >
                                        <div className="flex items-center hover:bg-[var(--vscode-list-hoverBackground)] rounded px-1">
                                            <CollapsibleTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="p-0 h-5 w-5 hover:bg-transparent"
                                                >
                                                    <ChevronRight className={cn(
                                                        "h-3 w-3 transition-transform duration-200",
                                                        expandedTool === tool.name && "rotate-90"
                                                    )} />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <p className="text-xs ml-1 leading-5">{tool.name}</p>
                                        </div>
                                        
                                        <CollapsibleContent className="pl-6 pt-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                                            <p className="text-xs text-[var(--vscode-descriptionForeground)] break-words pl-2 border-l border-[var(--vscode-widget-border)]">
                                                {tool.description}
                                            </p>
                                        </CollapsibleContent>
                                    </Collapsible>
                                ))}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )}
                
                {/* Environment Variables Section - Collapsible with VSCode styling */}
                {serverType === ServerType.PROCESS && server.env && Object.keys(server.env).length > 0 && (
                    <Collapsible 
                        open={showEnvVars} 
                        onOpenChange={setShowEnvVars} 
                        className="w-full transition-all duration-200"
                    >
                        <div className="flex items-center hover:bg-[var(--vscode-list-hoverBackground)] rounded px-1">
                            <CollapsibleTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="p-0 h-6 w-6 hover:bg-transparent"
                                >
                                    <ChevronRight className={cn(
                                        "h-4 w-4 transition-transform duration-200",
                                        showEnvVars && "rotate-90"
                                    )} />
                                </Button>
                            </CollapsibleTrigger>
                            <h4 className="text-xs font-medium text-[var(--vscode-editor-foreground)] ml-1">
                                Environment Variables ({Object.keys(server.env).length})
                            </h4>
                        </div>
                        
                        <CollapsibleContent className="mt-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                            <div className="pl-6 grid grid-cols-[1fr_1fr] gap-1 text-xs">
                                {Object.entries(server.env).map(([key, value]) => (
                                    <React.Fragment key={key}>
                                        <div className="font-medium truncate px-1 py-0.5 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded-l">
                                            {key}
                                        </div>
                                        <div className="truncate text-[var(--vscode-descriptionForeground)] px-1 py-0.5 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded-r">
                                            {value}
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )}
                
                {/* Actions - VSCode styled buttons */}
                <div className="flex justify-end gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="text-xs h-7 hover:bg-[var(--vscode-button-hoverBackground)]"
                    >
                        <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveServer(server.id)}
                        className="text-xs h-7 bg-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)] hover:opacity-90"
                    >
                        <Trash className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                </div>
            </div>
        );
    };

    // Enhanced server editing form with VSCode patterns
    const renderEditForm = () => {
        return (
            <div className="space-y-3 pt-3 border-t border-[var(--vscode-widget-border)] animate-in fade-in-50 duration-200">
                {/* VSCode styled settings form */}
                <div className="grid gap-3">
                    <div>
                        <label htmlFor={`server-name-${server.id}`} className="text-xs font-medium block mb-1">
                            Server Name:
                        </label>
                        <Input
                            id={`server-name-${server.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full text-sm h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                        />
                    </div>

                    <div>
                        <fieldset className="border border-[var(--vscode-widget-border)] rounded p-2">
                            <legend className="text-xs font-medium px-1">Server Type</legend>
                            <div className="flex space-x-4">
                                <label className="flex items-center space-x-1 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={editType === ServerType.PROCESS}
                                        onChange={() => setEditType(ServerType.PROCESS)}
                                        className="accent-[var(--vscode-focusBorder)]"
                                    />
                                    <span className="text-xs">Process</span>
                                </label>
                                <label className="flex items-center space-x-1 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={editType === ServerType.SSE}
                                        onChange={() => setEditType(ServerType.SSE)}
                                        className="accent-[var(--vscode-focusBorder)]"
                                    />
                                    <span className="text-xs">SSE</span>
                                </label>
                            </div>
                        </fieldset>
                    </div>

                    {editType === ServerType.PROCESS ? (
                        <>
                            <div>
                                <label htmlFor={`server-command-${server.id}`} className="text-xs font-medium block mb-1">
                                    Start Command:
                                </label>
                                <Input
                                    id={`server-command-${server.id}`}
                                    value={editCommand}
                                    onChange={(e) => setEditCommand(e.target.value)}
                                    className="w-full font-mono text-sm h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                />
                            </div>
                            
                            <div className="border border-[var(--vscode-widget-border)] rounded p-2">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-medium">Environment Variables:</label>
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        onClick={handleAddNewEnvVar}
                                        size="sm"
                                        className="text-xs h-6 px-2 border-[var(--vscode-button-border)] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
                                    >
                                        Add
                                    </Button>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <div className="grid grid-cols-[1fr_1fr_auto] gap-x-2">
                                        <Input
                                            value={newEnvKey}
                                            onChange={(e) => setNewEnvKey(e.target.value)}
                                            placeholder="KEY"
                                            className="text-xs h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                            onKeyDown={handleKeyPress}
                                        />
                                        <Input
                                            value={newEnvValue}
                                            onChange={(e) => setNewEnvValue(e.target.value)}
                                            placeholder="value"
                                            className="text-xs h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                            onKeyDown={handleKeyPress}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={handleAddNewEnvVar}
                                            size="sm"
                                            className="px-1 h-7 hover:bg-[var(--vscode-button-hoverBackground)]"
                                            aria-label="Add environment variable"
                                        >
                                            +
                                        </Button>
                                    </div>
                                    
                                    {editEnvVars.length > 0 && <Separator className="my-2 bg-[var(--vscode-widget-border)]" />}
                                    
                                    {editEnvVars.map((envVar, index) => (
                                        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-x-2">
                                            <Input
                                                value={envVar.key}
                                                onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                                                className="text-xs h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                            />
                                            <Input
                                                value={envVar.value}
                                                onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                                                className="text-xs h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => removeEnvVar(index)}
                                                size="sm"
                                                className="px-1 h-7 text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)]/10"
                                                aria-label="Remove environment variable"
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
                                <label htmlFor={`server-url-${server.id}`} className="text-xs font-medium block mb-1">
                                    Server URL:
                                </label>
                                <Input
                                    id={`server-url-${server.id}`}
                                    value={editUrl}
                                    onChange={(e) => setEditUrl(e.target.value)}
                                    className="w-full font-mono text-sm h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                />
                            </div>
                            
                            <div>
                                <label htmlFor={`auth-token-${server.id}`} className="text-xs font-medium block mb-1">
                                    Authentication Token (optional):
                                </label>
                                <Input
                                    id={`auth-token-${server.id}`}
                                    type="password"
                                    value={editAuthToken}
                                    onChange={(e) => setEditAuthToken(e.target.value)}
                                    className="w-full text-sm h-7 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Edit form actions - styled like VSCode */}
                <div className="flex justify-end space-x-2 mt-3 pt-2 border-t border-[var(--vscode-widget-border)]">
                    <Button
                        variant="secondary"
                        onClick={handleCancel}
                        size="sm"
                        className="text-xs h-7 bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEditServer}
                        size="sm"
                        className="text-xs h-7 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
                    >
                        Save
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <Card className={cn(
            "w-full flex flex-col text-[var(--vscode-editor-foreground)]",
            "border border-[var(--vscode-widget-border)] rounded-md shadow-sm overflow-hidden",
            "hover:border-[var(--vscode-focusBorder)] transition-colors duration-200",
            "hover:shadow-md",
            isExpanded && "border-[var(--vscode-focusBorder)]",
            className
        )}>
            <CardHeader className="px-3 py-2.5 flex flex-col space-y-0">
                <div className="flex items-center justify-between w-full gap-2">
                    <Collapsible 
                        open={isExpanded || isEditing} 
                        onOpenChange={isEditing ? undefined : setIsExpanded}
                        className="flex-1 transition-all duration-200"
                    >
                        <CollapsibleTrigger 
                            asChild
                            disabled={isEditing}
                        >
                            <div className={cn(
                                "cursor-pointer w-full",
                                !isEditing && "hover:bg-[var(--vscode-list-hoverBackground)] rounded"
                            )}>
                                {renderCompactView()}
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                            {isEditing ? renderEditForm() : renderExpandedDetails()}
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Controls moved outside the collapsible trigger */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Enable/disable switch with proper theme colors */}
                        <Switch 
                            checked={server.enabled} 
                            onCheckedChange={(checked) => {
                                // Prevent event from bubbling up to the collapsible trigger
                                handleToggleServer(server.id, checked);
                            }}
                            onClick={(event) => {
                                // Prevent event from bubbling up to the collapsible trigger
                                event.stopPropagation();
                            }}
                            className={cn(
                                "w-9 h-5 shrink-0",
                                "bg-[var(--vscode-inputOption-activeBackground)] data-[state=unchecked]:bg-[var(--vscode-input-background)]",
                                "border border-[var(--vscode-inputOption-activeBorder)]",
                                "[&_span]:block [&_span]:w-4 [&_span]:h-4 [&_span]:bg-[var(--vscode-editor-background)] [&_span]:rounded-full [&_span]:shadow-sm [&_span]:ring-0 [&_span]:transition-transform",
                                "[&_span]:data-[state=checked]:translate-x-4 [&_span]:data-[state=unchecked]:translate-x-0"
                            )}
                            aria-label="Toggle server"
                        />
                        
                        {/* Actions dropdown menu with theme integration */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 hover:bg-[var(--vscode-list-hoverBackground)]"
                                    onClick={(event) => {
                                        // Prevent event from bubbling up to the collapsible trigger
                                        event.stopPropagation();
                                    }}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent 
                                align="end"
                                className="bg-[var(--vscode-menu-background)] text-[var(--vscode-menu-foreground)] border-[var(--vscode-widget-border)]"
                            >
                                <DropdownMenuItem 
                                    onClick={(event: React.MouseEvent) => {
                                        event.stopPropagation();
                                        setIsEditing(true);
                                    }}
                                    className="hover:bg-[var(--vscode-list-hoverBackground)] focus:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                                >
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    onClick={(event: React.MouseEvent) => {
                                        event.stopPropagation();
                                        handleRemoveServer(server.id);
                                    }}
                                    className="text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] focus:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                                >
                                    <Trash className="mr-2 h-4 w-4" />
                                    <span>Remove</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>
        </Card>
    );
}