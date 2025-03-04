import React, { useState, useEffect } from 'react';
import '@/styles/globals.css';
import { ServerConfig, ServerWithTools, ServerType, EnvVar, ChatParticipant, InstancesStatusData, ServerInstance } from './types';
import { ServerCard } from './components/ServerCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { 
  Plus, X, Search, FilePlus, FileEdit, ServerIcon, Edit, AlertCircle,
  RefreshCw, Terminal, Activity, Circle, ChevronRight, ListFilter
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

declare global {
  interface Window {
    vscodeApi?: any;
    serverState?: any[];
  }
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

// Reusable CollapsibleSection component
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  count, 
  children, 
  defaultExpanded = false 
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="border dark-border rounded my-4">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3 hover:bg-[var(--vscode-list-hoverBackground)] rounded">
        <div className="flex items-center gap-2">
          <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
          <h4 className="text-sm font-medium">
            {title} {count !== undefined && <span className="text-[var(--vscode-descriptionForeground)]">({count})</span>}
          </h4>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="p-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

// Using the EnvVar interface from types.ts

const handleWebviewMessage = (event: MessageEvent) => {
  const message = event.data;
  console.log(`[MCP Debug] Received message: ${message.type}`, message);
  
  switch (message.type) {
    case 'setServers':
      console.log('Setting servers:', message.servers);
      // Log tools information for each server for debugging
      if (Array.isArray(message.servers)) {
        message.servers.forEach((server: any) => {
          console.log(`[MCP Tools Debug] Server ${server.name} has ${server.tools?.length || 0} tools:`, 
            Array.isArray(server.tools) ? server.tools.map((t: any) => t.name).join(', ') : 'none');
        });
      }
      return message.servers;
    
    case 'updateServer':
      console.log(`[MCP Debug] Updating server: ${message.server.name || message.server.id}`);
      // Preserve tools if they exist in the message, otherwise keep existing tools
      const toolsToUse = message.tools || message.server.tools;
      
      if (toolsToUse) {
        console.log(`[MCP Tools Debug] Server update includes ${toolsToUse.length} tools`);
      }
      
      return (current: ServerWithTools[]) => 
        current.map(server => 
          // Match by ID first if available, then by name
          (message.server.id && server.id === message.server.id) || 
            (!message.server.id && server.name === message.server.name)
            ? { 
                ...server, 
                ...message.server, 
                // Explicitly prioritize tools from the message
                tools: toolsToUse || server.tools, 
                // Only use running to update connection state
                isConnected: message.running,
                // Don't update enabled from running state, preserve configuration
                enabled: message.server.enabled !== undefined ? message.server.enabled : server.enabled 
              }
            : server
        );
    
    case 'updateServerTools':
      console.log(`[MCP Tools Debug] Received updateServerTools for server ID: ${message.id}, name: ${message.name}`);
      console.log(`[MCP Tools Debug] Tools payload (${message.tools?.length || 0} tools):`, message.tools);
      
      // More thorough validation of tools data
      let toolsToUpdate = [];
      
      if (Array.isArray(message.tools)) {
        toolsToUpdate = message.tools.filter((tool: any) => {
          if (!tool || typeof tool !== 'object') {
            console.error(`[MCP Tools Error] Invalid tool (not an object):`, tool);
            return false;
          }
          if (!tool.name || typeof tool.name !== 'string') {
            console.error(`[MCP Tools Error] Tool missing name property:`, tool);
            return false;
          }
          return true;
        });
        
        if (toolsToUpdate.length !== message.tools.length) {
          console.warn(`[MCP Tools Warning] Filtered out ${message.tools.length - toolsToUpdate.length} invalid tools`);
        }
      } else {
        console.error(`[MCP Tools Error] Tools is not an array:`, message.tools);
      }
      
      console.log(`[MCP Tools Debug] Processing ${toolsToUpdate.length} valid tools for server ID: ${message.id}, name: ${message.name}`);
      
      // Show notification if no tools were found when we expected them
      if (toolsToUpdate.length === 0 && message.expectedTools) {
        toast.error("No tools available", {
          description: `Server ${message.name} reported 0 tools. This might indicate a configuration issue.`,
          icon: <AlertCircle className="h-4 w-4" />
        });
      }
      
      return (current: ServerWithTools[]) => {
        const updatedServers = current.map(server => {
          // Match by ID first if available, then by name
          const isMatch = (message.id && server.id === message.id) || 
                        (!message.id && server.name === message.name);
          
          console.log(`[MCP Tools Debug] Checking server ${server.name} (ID: ${server.id}) against message ID: ${message.id}, name: ${message.name} - match: ${isMatch}`);
          
          if (isMatch) {
            const updatedServer = { 
              ...server, 
              tools: toolsToUpdate,
              // Preserve enabled setting from server config, don't overwrite with connection state
              isConnected: message.isConnected !== undefined ? message.isConnected : server.isConnected,
            };
            
            console.log(`[MCP Tools Debug] Updated server ${server.name} (ID: ${server.id}) with ${toolsToUpdate.length} tools`);
            return updatedServer;
          }
          return server;
        });
        
        return updatedServers;
      };
    
    case 'serverAdded':
      console.log('Server added:', message.server);
      // Ensure tools array exists even if empty
      const serverWithTools = {
        ...message.server,
        tools: message.server.tools || []
      };
      return (current: ServerWithTools[]) => [...current, serverWithTools];
    
    case 'serverRemoved':
      console.log('Server removed:', message.id || message.name);
      return (current: ServerWithTools[]) => 
        current.filter(server => 
          !(message.id && server.id === message.id) && 
          !(!message.id && server.name === message.name)
        );
    
    case 'serverUpdated':
      console.log('Server updated:', message.server);
      // Preserve tools when updating a server
      return (current: ServerWithTools[]) =>
        current.map(server => {
          // Match by ID first if available, then by name
          const isMatch = (message.server.id && server.id === message.server.id) || 
            (!message.server.id && server.name === message.server.name);
          
          if (isMatch) {
            return { 
              ...server, 
              ...message.server,
              // Preserve tools when updating other properties
              tools: message.server.tools || server.tools || []
            };
          }
          return server;
        });
    
    case 'serverToggling':
      console.log('Server toggling state:', message.id || message.name, message.toggling);
      return (current: ServerWithTools[]) =>
        current.map(server =>
          // Match by ID first if available, then by name
          (message.id && server.id === message.id) || 
            (!message.id && server.name === message.name)
            ? { ...server, isToggling: message.toggling }
            : server
        );
    
    case 'serverToggled':
      console.log('Server toggled:', message.id || message.name, message.enabled);
      return (current: ServerWithTools[]) =>
        current.map(server => {
          // Match by ID first if available, then by name
          const isMatch = (message.id && server.id === message.id) || 
            (!message.id && server.name === message.name);
          
          if (isMatch) {
            console.log(`[TOGGLE DEBUG] Updating server ${server.name} in UI: enabled=${message.enabled}, isConnected=${message.isConnected !== undefined ? message.isConnected : server.isConnected}`);
            return { 
              ...server, 
              enabled: message.enabled, 
              isToggling: false,
              // Use the isConnected value from the message if provided, otherwise keep the current value
              isConnected: message.isConnected !== undefined ? message.isConnected : server.isConnected
            };
          }
          return server;
        });
    
    case 'updateInstancesStatus':
      console.log('Instances status update:', message.data);
      // This is a special case - we just need to return the status data directly
      return { type: 'instancesStatus', data: message.data };

    case 'error':
      // Handle error messages
      console.error('Error from extension:', message.message);
      console.log(`[ERROR DEBUG] Error details: serverId=${message.serverId}, message="${message.message}"`);
      
      // Check if this is a connection error for a disabled server
      // We don't want to show error toasts for servers that are intentionally disabled
      if (message.serverId && message.message && 
          (message.message.includes('connect') || message.message.includes('ping') || 
           message.message.includes('unavailable'))) {
        
        // Find the server in the current state
        const server = window.serverState?.find((s: any) => 
          s.id === message.serverId || s.name === message.serverId);
        
        // If server exists and is disabled, don't show the error toast
        if (server && server.enabled === false) {
          console.log(`[ERROR FILTER] Suppressing connection error toast for disabled server: ${server.name}`);
          return undefined;
        }
      }
      
      toast.error("Error", {
        description: message.message || "An unknown error occurred"
      });
      return undefined;
    
    default:
      console.log('Unknown message type:', message.type, message);
      return undefined;
  }
};

export function App() {
  const [servers, setServers] = useState<ServerWithTools[]>([]);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [serverIdBeingEdited, setServerIdBeingEdited] = useState<string | undefined>(undefined);
  const [filterQuery, setFilterQuery] = useState('');
  const [serverName, setServerName] = useState('');
  const [serverType, setServerType] = useState<ServerType>(ServerType.PROCESS);
  const [serverCommand, setServerCommand] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [serverAuthToken, setServerAuthToken] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [chatParticipantEnabled, setChatParticipantEnabled] = useState(true);
  const [chatParticipantName, setChatParticipantName] = useState('');
  const [chatParticipantDescription, setChatParticipantDescription] = useState('');
  const [chatParticipantIsSticky, setChatParticipantIsSticky] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Store server state globally for error filtering
  useEffect(() => {
    // Make servers available globally for error filtering
    window.serverState = servers;
  }, [servers]);

  const validateServerName = (name: string): boolean => {
    // Allow spaces and most characters, but avoid characters that might cause issues
    // Just ensure the name is not empty and doesn't contain problematic characters like / \ : * ? " < > |
    return name.trim().length > 0 && !/[\/\\:*?"<>|]/.test(name);
  };

  const escapeCommand = (command: string): string => {
    // Replace single quotes with escaped single quotes
    // Replace double quotes with escaped double quotes
    return command.replace(/'/g, "\\'").replace(/"/g, '\\"');
  };

  useEffect(() => {
    // Listen for messages from the extension
    const messageHandler = (event: MessageEvent) => {
      const result = handleWebviewMessage(event);
      if (typeof result === 'function') {
        setServers(result);
      } else if (Array.isArray(result)) {
        setServers(result);
      } else if (result && typeof result === 'object' && result.type === 'instancesStatus') {
        // We no longer handle instancesStatus messages in this component
      }
    };

    window.addEventListener('message', messageHandler);

    // Request initial server list and instances status
    window.vscodeApi.postMessage({ type: 'getServers' });

    return () => {
      window.removeEventListener('message', messageHandler);
    }
  }, []);

  // Log when expandedServerId changes
  useEffect(() => {
    console.log(`[App] Expanded server ID changed to: ${expandedServerId || 'none'}`);
  }, [expandedServerId]);


  const resetForm = () => {
    setServerName('');
    setServerType(ServerType.PROCESS);
    setServerCommand('');
    setServerUrl('');
    setServerAuthToken('');
    setChatParticipantEnabled(true);
    setChatParticipantName('');
    setChatParticipantDescription('');
    setChatParticipantIsSticky(false);
    setEnvVars([]);
    setFormError(null);
    setIsEditingExisting(false);
    setServerIdBeingEdited(undefined);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    resetForm();
  };

  const handleAddOrEditServer = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // Validate inputs
    // Only validate server name in add mode since it can't be changed in edit mode
    if (!isEditingExisting) {
      if (!serverName.trim()) {
        setFormError('Server name is required');
        return;
      }
      
      if (!validateServerName(serverName)) {
        setFormError('Server name cannot be empty or contain any of these characters: / \\ : * ? " < > |');
        return;
      }
    }
    
    if (serverType === ServerType.PROCESS && !serverCommand.trim()) {
      setFormError('Command is required for process servers');
      return;
    }
    
    if (serverType === ServerType.SSE && !serverUrl.trim()) {
      setFormError('URL is required for SSE servers');
      return;
    }

    // Convert envVars array to object
    const env = envVars.reduce((acc, { key, value }) => {
      if (key.trim()) {
        // Make sure to trim both key and value to avoid whitespace issues
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {} as { [key: string]: string });
    
    // Log the environment variables for debugging
    console.log('Environment variables being added/edited:', env);

    // Prepare server config based on type
    const serverConfig: Partial<ServerConfig> = {
      name: serverName.trim(),
      enabled: true, // Always default to enabled for new servers
      type: serverType,
    };

    // If editing, add the ID
    if (isEditingExisting && serverIdBeingEdited) {
      serverConfig.id = serverIdBeingEdited;
      
      // When editing, don't change enabled state unless it's disabled
      // Find the current server to preserve its enabled state
      const currentServer = servers.find(s => s.id === serverIdBeingEdited);
      if (currentServer) {
        // Keep server enabled if it was already enabled, otherwise enable it
        serverConfig.enabled = currentServer.enabled || true;
      }
    }

    if (serverType === ServerType.PROCESS) {
      serverConfig.command = escapeCommand(serverCommand.trim());
      // Only include env vars if there are actually keys defined
      if (Object.keys(env).length > 0) {
        serverConfig.env = env;
      }
    } else {
      serverConfig.url = serverUrl.trim();
      serverConfig.authToken = serverAuthToken;
    }

    // Add chat participant configuration
    serverConfig.chatParticipant = {
      enabled: chatParticipantEnabled,
      name: chatParticipantName.toLowerCase().replace(/\s+/g, '').trim() || serverName.trim().toLowerCase().replace(/\s+/g, ''),
      description: chatParticipantDescription.trim() || `Tools for ${serverName.trim()}`,
      isSticky: chatParticipantIsSticky
    };

    // Send to extension - different message type based on whether adding or editing
    window.vscodeApi.postMessage({
      type: isEditingExisting ? 'editServer' : 'addServer',
      server: serverConfig
    });

    // Show success message
    toast.success(isEditingExisting ? "Server updated successfully" : "Server added successfully", {
      description: isEditingExisting ?
        `"${serverName}" has been updated.` :
        `"${serverName}" has been added to your servers.`,
    });

    // Close modal and reset form
    handleCloseModal();
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

  // Get date/time in readable format
  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Format uptime from milliseconds to readable format
  const formatUptime = (startTime: number) => {
    const uptime = Date.now() - startTime;
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const filteredServers = servers.filter(server => 
    server.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-[var(--vscode-background)] text-[var(--vscode-editor-foreground)]">
      <Toaster position="top-right" richColors closeButton />
      <div className="mx-auto w-full min-w-[320px] max-w-[1200px] px-1 py-2 sm:p-4 md:p-5 responsive-container">
        <div className="flex flex-col space-y-4">
          {/* Header bar with title, search, and add button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center space-x-2">
              <ServerIcon className="h-5 w-5 text-[var(--vscode-textLink-foreground)]" />
              <h1 className="text-xl font-semibold responsive-text">Servers</h1>
            </div>
            
            <div className="flex flex-1 sm:flex-row items-center gap-3 sm:justify-end">
              {/* Search and filter bar */}
              <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-[var(--vscode-descriptionForeground)]" />
                </div>
                <Input
                  type="text"
                  placeholder="Filter servers..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-10 h-9 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                />
                {filterQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFilterQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-1 hover:bg-transparent"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => setIsAddModalOpen(true)}
                      className="h-9 whitespace-nowrap dark-steel-button"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Add a new MCP server</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          
          {/* Server grid with responsive layout */}
          
          {/* Server Instances View Button */}

          <div className="mt-4">
            {filteredServers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 border dark-border rounded-lg bg-[var(--vscode-editor-background)] text-[var(--vscode-descriptionForeground)]">
                {servers.length === 0 ? (
                  <>
                    <FilePlus className="h-12 w-12 mb-4 opacity-40" />
                    <h3 className="text-lg font-medium">No servers configured</h3>
                    <p className="mt-2 text-center max-w-md">
                      Add your first MCP server by clicking the "Add Server" button
                    </p>
                    <Button 
                      onClick={() => setIsAddModalOpen(true)}
                      className="mt-6 dark-steel-button"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </>
                ) : (
                  <>
                    <FileEdit className="h-12 w-12 mb-4 opacity-40" />
                    <h3 className="text-lg font-medium">No matching servers</h3>
                    <p className="mt-2 text-center">
                      No servers match your filter criteria
                    </p>
                    <Button 
                      onClick={() => setFilterQuery('')}
                      variant="outline" 
                      className="mt-6 dark-steel-button"
                    >
                      Clear filter
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-180px)] pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 gap-4 server-card-container" style={{width: '100%', maxWidth: '100%'}}>
                  {filteredServers.map(server => (
                    <ServerCard
                      key={server.name}
                      server={server}
                      onOpenChange={(isOpen) => {
                        // When a card is opened, set it as the expanded card
                        console.log(`[App] Server ${server.name} expansion state changed to ${isOpen}`);
                        // When a card is closed, clear the expanded card
                        const newExpandedId = isOpen ? server.id : null;
                        setExpandedServerId(newExpandedId);
                      }}
                      isExpanded={expandedServerId === server.id}
                      onEdit={(serverToEdit) => {
                        // Use the existing modal for editing by pre-filling it
                        setServerName(serverToEdit.name);
                        setServerType(serverToEdit.type || ServerType.PROCESS);
                        setServerCommand(serverToEdit.command || '');
                        setServerUrl(serverToEdit.url || '');
                        setServerAuthToken(serverToEdit.authToken || '');

                        // Set chat participant configuration
                        setChatParticipantEnabled(serverToEdit.chatParticipant?.enabled ?? true);
                        setChatParticipantName(`${serverToEdit.chatParticipant?.name?.toLowerCase().replace(/\s+/g, '') || serverToEdit.name?.toLowerCase().replace(/\s+/g, '')}`);
                        setChatParticipantDescription(serverToEdit.chatParticipant?.description || `Tools for ${serverToEdit.name}`);
                        setChatParticipantIsSticky(serverToEdit.chatParticipant?.isSticky ?? false);
                        
                        // Convert env object to array for editing
                        if (serverToEdit.env && typeof serverToEdit.env === 'object') {
                          setEnvVars(Object.entries(serverToEdit.env).map(([key, value]) => ({ key, value: value || '' })));
                        } else {
                          setEnvVars([]);
                        }
                        
                        // Set editing mode and open the modal
                        setIsEditingExisting(true);
                        setServerIdBeingEdited(serverToEdit.id);
                        setIsAddModalOpen(true);
                      }}
                      onUpdate={() => {
                        toast.success("Server updated", {
                          description: `"${server.name}" has been updated successfully.`
                        });
                      }}
                      onRemove={(name) => {
                        toast.success("Server removed", {
                          description: `"${name}" has been removed from your servers.`
                        });
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </div>
      
      {/* Add/Edit Server Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent 
          className="bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] border dark-border dialog-responsive min-w-[300px]"
          onInteractOutside={(e) => {
            e.preventDefault(); 
            // Only allow closing via the explicit buttons
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {isEditingExisting ? (
                <>
                  <Edit className="h-5 w-5" />
                  Edit MCP Server
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  Add MCP Server
                </>
              )}
            </DialogTitle>
          
          </DialogHeader>
          
          <form onSubmit={handleAddOrEditServer} className="space-y-4 mt-2">
            {formError && (
              <div className="p-3 rounded bg-[var(--vscode-errorForeground)]/10 text-[var(--vscode-errorForeground)] text-sm">
                {formError}
              </div>
            )}
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="server-name">Server Name</Label>
                <Input
                  id="server-name"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="My MCP Server"
                  disabled={isEditingExisting}
                  className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                />
                {isEditingExisting && (
                  <p className="text-xs text-[var(--vscode-descriptionForeground)]">
                    Server name cannot be changed in edit mode
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Server Type</Label>
                <div className="flex space-x-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="type-process"
                      name="server-type"
                      checked={serverType === ServerType.PROCESS}
                      onChange={() => setServerType(ServerType.PROCESS)}
                      className="accent-[var(--vscode-focusBorder)]"
                      aria-label="stdio server type"
                    />
                    <Label htmlFor="type-process" className="cursor-pointer">stdio</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="type-sse"
                      name="server-type"
                      checked={serverType === ServerType.SSE}
                      onChange={() => setServerType(ServerType.SSE)}
                      className="accent-[var(--vscode-focusBorder)]"
                      aria-label="SSE server type"
                    />
                    <Label htmlFor="type-sse" className="cursor-pointer">SSE</Label>
                  </div>
                </div>
              </div>
              
              {serverType === ServerType.PROCESS ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="server-command">Start Command</Label>
                    <Input
                      id="server-command"
                      value={serverCommand}
                      onChange={(e) => setServerCommand(e.target.value)}
                      placeholder="python -m mcp_server"
                      className="font-mono text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Environment Variables</Label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addEnvVar}
                        size="sm"
                        className="h-7 text-xs dark-steel-button"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Variable
                      </Button>
                    </div>
                    
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {envVars.map((envVar, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={envVar.key}
                            onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                            placeholder="KEY"
                            className="flex-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                          />
                          <Input
                            value={envVar.value}
                            onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                            placeholder="value"
                            className="flex-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEnvVar(index)}
                            className="h-10 w-10 text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)]/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="server-url">Server URL</Label>
                    <Input
                      id="server-url"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://your-mcp-server.example.com/events"
                      className="font-mono text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="auth-token">Authentication Token (Optional)</Label>
                    <Input
                      id="auth-token"
                      type="password"
                      value={serverAuthToken}
                      onChange={(e) => setServerAuthToken(e.target.value)}
                      placeholder="••••••••••••••••••••"
                      className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                    />
                  </div>
                </>
              )}

              {/* Chat Participant Configuration */}
              <div className="space-y-2 border-t dark-border pt-4 mt-4">
                <div className="flex justify-between items-center">
                  <Label htmlFor="chat-participant-enabled" className="text-base font-medium">Chat Participant</Label>
                  <div className="flex items-center">
                    <Switch
                      id="chat-participant-enabled"
                      checked={chatParticipantEnabled}
                      onCheckedChange={(checked) => setChatParticipantEnabled(checked)}
                      aria-label="Enable chat participant"
                    />
                    <Label htmlFor="chat-participant-enabled" className="cursor-pointer ml-2">Enabled</Label>
                  </div>
                </div>
                
                {chatParticipantEnabled && (
                  <div className="space-y-3 mt-2">
                    <div className="space-y-2">
                      <Label htmlFor="chat-participant-name">Chat Username</Label>
                      <Input
                        id="chat-participant-name"
                        value={chatParticipantName}
                        onChange={(e) => setChatParticipantName(e.target.value)}
                        placeholder={serverName || "mcpsx-run Server"}
                        className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                      />
                      <p className="text-xs text-[var(--vscode-descriptionForeground)]">
                        Leave empty to use server name
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="chat-participant-description">Description</Label>
                      <Input
                        id="chat-participant-description"
                        value={chatParticipantDescription}
                        onChange={(e) => setChatParticipantDescription(e.target.value)}
                        placeholder={`Tools for ${serverName || "this server"}`}
                        className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)]"
                      />
                      <p className="text-xs text-[var(--vscode-descriptionForeground)]">
                        Leave empty to use default description
                      </p>
                    </div>
                    
                    <div className="flex items-center">
                      <Switch
                        id="chat-participant-sticky"
                        checked={chatParticipantIsSticky}
                        onCheckedChange={(checked) => setChatParticipantIsSticky(checked)}
                        aria-label="Make chat participant sticky"
                      />
                      <Label htmlFor="chat-participant-sticky" className="cursor-pointer ml-2">
                        Sticky (always show in chat)
                      </Label>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="mt-6 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                className="border-[var(--vscode-button-border)] dark-steel-button"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="dark-steel-button"
              >
                {isEditingExisting ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
