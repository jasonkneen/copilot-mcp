import React, { useState, useEffect } from "react";
import { 
  ChevronRight, 
  Edit, 
  Trash, 
  Terminal, 
  Globe, 
  AlertCircle,
  Info, 
  Copy,
  Plus,
  X,
  ListTree,
  Layers,
  ExternalLink,
  Circle
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

import { ServerWithTools, ServerType, EnvVar, ServerConfig } from "../types";

type ServerCardProps = React.ComponentProps<typeof Card> & {
  server: ServerWithTools;
  onEdit?: (server: ServerWithTools) => void; 
  isExpanded?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onUpdate?: () => void;
  onRemove?: (serverName: string) => void;
};

export const ServerCard = ({ className, server, onEdit, isExpanded, onOpenChange, onUpdate, onRemove }: ServerCardProps) => {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [isLocalExpanded, setIsLocalExpanded] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Force rerenders when toggle is clicked
  const [localEnabled, setLocalEnabled] = useState(server.enabled);
  const [isToggling, setIsToggling] = useState(false);

  // Use external expansion state if provided
  useEffect(() => {
    if (isExpanded !== undefined) {
      console.log(`[ServerCard] ${server.name}: External expansion state changed to ${isExpanded}`);
      setIsLocalExpanded(isExpanded);
    }
  }, [isExpanded, server.name]);



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
    // Always keep local state in sync with server config state
    setLocalEnabled(server.enabled);
  }, [server.enabled]);
  
  // No longer need the edit fields state management

  const handleToggleServer = (enabled: boolean) => {
    console.log(`[TOGGLE DEBUG] Toggling server ${server.name} (${server.id}) to ${enabled ? 'enabled' : 'disabled'}, current state: enabled=${localEnabled}, isConnected=${server.isConnected}`);
    
    // Prevent double toggle or rapid toggling by checking if we're already toggling
    if (isToggling) {
      console.log(`[TOGGLE DEBUG] Ignoring toggle request - already toggling`);
      return;
    }
    
    // If we're already in the requested state, do nothing
    if (enabled === localEnabled && !isToggling) {
      console.log(`[TOGGLE DEBUG] Server ${server.name} is already in the requested state (${enabled ? 'enabled' : 'disabled'})`);
      return;
    }
    
    // Show toggling state
    setIsToggling(true);
    
    // Update local state immediately for responsive UI
    setLocalEnabled(enabled);
    
    // Post message to VSCode extension - use ID if available
    window.vscodeApi.postMessage({
      type: 'toggleServer',
      id: server.id,
      name: server.name, // Include name as fallback
      enabled
    });
    
    // Display a loading toast when enabling server
    if (enabled) {
      window.vscodeApi.postMessage({
        type: 'showNotification',
        message: `Starting server ${server.name}...`,
        isLoading: true
      });
    }
    
    // Reset toggling state after a timeout if server doesn't respond
    setTimeout(() => {
      setIsToggling(false);
      console.log(`[TOGGLE DEBUG] Reset toggling state after timeout for ${server.name}, current enabled=${localEnabled}`);
    }, 8000); // Increase timeout to 8 seconds to allow more time for server to respond
  };
  
  // Reset toggling state when server.enabled changes (meaning toggle completed)
  useEffect(() => {
    if (isToggling) {
      console.log(`[TOGGLE DEBUG] Server ${server.name} enabled state changed to ${server.enabled}, resetting toggling state, localEnabled=${localEnabled}`);
      setIsToggling(false);
    }
  }, [server.enabled]);

  const handleRemoveServer = () => {
    window.vscodeApi.postMessage({
      type: 'removeServer',
      id: server.id,
      name: server.name // Include name as fallback
    });
    
    setShowDeleteConfirm(false);
    if (onRemove) {
      onRemove(server.name);
    }
  };

  const handleEditServer = () => {
    if (onEdit) {
      onEdit(server);
    }
  };

  // We've removed the edit form code since we're now using the main dialog

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Using window.vscodeApi to send message to show VSCode notification
      window.vscodeApi.postMessage({
        type: 'showNotification',
        message: `${label} copied to clipboard`,
      });
    });
  };

  // Server type icon and status indicators
  // Ensure server properties are available, with sensible defaults
const serverType = server?.type || ServerType.PROCESS;
// Apply sensible defaults to any missing properties
const serverWithDefaults = {
  ...server,
  id: server.id || 'unknown-id', // Default ID in case it's missing
  name: server.name || 'Unknown Server',
  type: serverType,
  command: server.command || '',
  url: server.url || '',
  enabled: server.enabled || false,
  env: server.env || {},
  tools: Array.isArray(server.tools) ? [...server.tools] : [],
  resources: Array.isArray(server.resources) ? [...server.resources] : []
};
// Log server properties for debugging
console.log('[CARD DEBUG] ServerCard received server data:', JSON.stringify({
  id: serverWithDefaults.id,
  name: serverWithDefaults.name,
  type: serverWithDefaults.type,
  enabled: serverWithDefaults.enabled,
  toolsLength: serverWithDefaults.tools?.length || 0,
  isToolsArray: Array.isArray(serverWithDefaults.tools),
  toolsType: typeof serverWithDefaults.tools
}, null, 2));

if (serverWithDefaults.tools && serverWithDefaults.tools.length > 0) {
  console.log('[CARD DEBUG] First tool data:', JSON.stringify(serverWithDefaults.tools[0], null, 2));
} else {
  console.log('[CARD DEBUG] No tools in ServerCard for', serverWithDefaults.name);
}

// Special debug force to verify if the tools property is accessible and properly typed
try {
  console.log('[CARD DEBUG] Tools array inspection for', serverWithDefaults.name, ':',
    (serverWithDefaults.tools || []).map(t => t.name || 'unnamed').join(', ')
  );
} catch (e) {
  console.error('[CARD DEBUG] Error accessing tools array:', e);
}

// Ensure tools are properly formatted objects with required properties
serverWithDefaults.tools = serverWithDefaults.tools.filter(tool => {
  if (!tool || typeof tool !== 'object') {
    console.error('[CARD DEBUG] Filtering out invalid tool (not an object):', tool);
    return false;
  }
  if (!tool.name || typeof tool.name !== 'string') {
    console.error('[CARD DEBUG] Filtering out tool without valid name:', tool);
    return false;
  }
  return true;
});
  const TypeIcon = serverType === ServerType.SSE ? Globe : Terminal;
  const toolsCount = serverWithDefaults.tools?.length || 0;
  const envVarsCount = server.env ? Object.keys(server.env).length : 0;

  // We're no longer rendering the edit form since we're using the shared dialog

  // Render the compact header of the card
  const renderCardHeader = () => (
    <div className="flex flex-row items-center justify-between gap-3 group w-full" style={{flexDirection: 'row', display: 'flex'}}>
      {/* Left side with chevron and server info - fixed for horizontal text */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex-shrink-0 flex items-center justify-center w-6">
          <ChevronRight 
            className={cn(
              "h-4 w-4 text-[var(--vscode-descriptionForeground)] transition-transform duration-200 responsive-icon",
              isLocalExpanded && "rotate-90 text-[var(--vscode-focusBorder)]"
            )} 
          />
        </div>
        
        <div className="flex-shrink-0 flex items-center justify-center w-6">
          <Terminal 
            size={16} 
            className={cn(
              localEnabled 
                ? "text-[var(--steel-accent)]" 
                : "text-[var(--vscode-descriptionForeground)]"
            )} 
          />
        </div>
        
        <div className="flex-1 min-w-0 mr-2" style={{width: '100%', display: 'block'}}>
          <h3 className="text-lg font-semibold leading-tight break-words whitespace-normal" style={{display: 'block', width: '100%', wordBreak: 'break-word', textOrientation: 'mixed', writingMode: 'horizontal-tb'}}>
            {server.name}
          </h3>
          {!isLocalExpanded && (
            <p className="text-xs text-[var(--vscode-descriptionForeground)] leading-tight break-words whitespace-normal" style={{display: 'block', width: '100%', wordBreak: 'break-word', textOrientation: 'mixed', writingMode: 'horizontal-tb'}}>
              {server.tools && server.tools.length > 0 ? `${server.tools.length} tools available` : 'No tools available'}
            </p>
          )}
        </div>
      </div>
      
      {/* Right side with badges and switch */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {toolsCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline"
                  className="text-xs font-normal h-6 bg-[var(--vscode-badge-background)]/10 hover:bg-[var(--vscode-badge-background)]/20 text-[var(--vscode-badge-foreground)] border-[var(--vscode-badge-background)]/30"
                >
                  <Layers className="h-3 w-3 mr-1 opacity-70" />
                  {toolsCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[90vw] sm:max-w-xs">
                <p>{toolsCount} tools available</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Server status indicators */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                {/* Configuration indicator */}
                {/* Connection indicator */}
                <Circle 
                  className={cn(
                    "h-3 w-3 fill-current",
                    isToggling ? "text-amber-500 animate-pulse" :
                    !localEnabled ? "text-gray-400" : // If disabled, always show gray
                    server.isConnected ? "text-green-500" : // If enabled and connected, show green
                    "text-red-500" // If enabled but not connected, show red
                  )} 
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-1">
                  {isToggling ? (
                    <>
                      <Circle className="h-2 w-2 fill-current text-amber-500" />
                      <span>{localEnabled ? "Connecting..." : "Disconnecting..."}</span>
                    </>
                  ) : (!localEnabled) ? (
                    <>
                      <Circle className="h-2 w-2 fill-current text-gray-400" />
                      <span>Not running (disabled)</span>
                    </>
                  ) : (server.isConnected) ? (
                    <>
                      <Circle className="h-2 w-2 fill-current text-green-500" />
                      <span>Running and connected</span>
                    </>
                  ) : (
                    <>
                      <Circle className="h-2 w-2 fill-current text-red-500" />
                      <span>Not connected (enabled but offline)</span>
                    </>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {isToggling ? (
          <div className="flex-shrink-0 w-9 h-6 flex items-center justify-center">
            <div className="animate-spin h-4 w-4 border-2 border-[var(--vscode-focusBorder)] rounded-full border-t-transparent"></div>
          </div>
        ) : (
          <Switch 
            checked={localEnabled}
            onCheckedChange={(checked) => {
              console.log(`[TOGGLE DEBUG] Switch onCheckedChange: ${checked}`);
              handleToggleServer(checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex-shrink-0",
              localEnabled && server.isConnected && "bg-green-500 data-[state=checked]:bg-green-500"
            )}
            aria-label="Toggle server"
          />
        )}
      </div>
    </div>
  );
  
  // Render the expanded content of the card
  const renderExpandedContent = () => (
    <div className="space-y-4 pt-4 mt-2 border-t dark-border">
      {/* Tools section */}
      {serverWithDefaults.tools && serverWithDefaults.tools.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
            Available Tools <span className="opacity-80">({serverWithDefaults.tools.length})</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {serverWithDefaults.tools.map((tool) => (
              <HoverCard key={tool.name}>
                <HoverCardTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]"
                  >
                    <ListTree className="h-3 w-3 mr-1" />
                    {tool.name}
                  </Badge>
                </HoverCardTrigger>
                <HoverCardContent className="w-auto max-w-[90vw] sm:max-w-md">
                  <div className="space-y-2">
                    <p className="text-sm">{tool.description}</p>
                    <div>
                      <div className="text-[0.65rem] uppercase font-semibold text-[var(--vscode-descriptionForeground)] mb-1">Schema</div>
                      <pre className="overflow-x-auto bg-[var(--vscode-terminal-background)]/90 p-2 rounded-md text-[0.7rem] w-full">
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        </div>
      )}

      {/* Server configuration section */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
          Server Configuration
        </h4>
        
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-start text-sm">
          <span className="text-[var(--vscode-descriptionForeground)]">Type:</span>
          <div className="flex items-center">
            <Badge 
              variant="outline" 
              className="w-fit dark-steel-badge"
            >
              {serverType === ServerType.SSE ? (
                <div className="flex items-center gap-1">
                  <Globe className="h-3 w-3" /> SSE
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Terminal className="h-3 w-3" /> Process
                </div>
              )}
            </Badge>
          </div>
          
          {serverType === ServerType.PROCESS ? (
            <>
              <span className="text-[var(--vscode-descriptionForeground)]">Command:</span>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <div className="group flex items-center gap-1 cursor-pointer">
                    <code className="px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto w-full inline-block break-all">
                      {server.command}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(server.command || '', 'Command')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-auto max-w-[90vw] sm:max-w-md">
                  <p className="text-xs">Server command</p>
                </HoverCardContent>
              </HoverCard>
            </>
          ) : (
            <>
              <span className="text-[var(--vscode-descriptionForeground)]">URL:</span>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <div className="group flex items-center gap-1 cursor-pointer">
                    <code className="px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs overflow-x-auto max-w-[200px] sm:max-w-[300px] truncate inline-block">
                      {server.url}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(server.url || '', 'URL')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-auto max-w-[90vw] sm:max-w-md">
                  <div className="flex justify-between items-center">
                    <p className="text-xs">Server URL endpoint</p>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => window.open(server.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </HoverCardContent>
              </HoverCard>
              
              {server.authToken && (
                <>
                  <span className="text-[var(--vscode-descriptionForeground)]">Auth Token:</span>
                  <div className="flex items-center gap-1">
                    <div className="px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded font-mono text-xs">
                      •••••••••••••••••
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(server.authToken || '', 'Authentication token')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat Participant configuration section */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
          Chat Participant
        </h4>
        
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-start text-sm">
          <span className="text-[var(--vscode-descriptionForeground)]">Enabled:</span>
          <div className="flex items-center">
            <Badge 
              variant="outline" 
              className={cn(
                "w-fit",
                server.chatParticipant?.enabled ? "bg-green-500/10 text-green-500 border-green-500/30" : "bg-gray-500/10 text-gray-500 border-gray-500/30"
              )}
            >
              {server.chatParticipant?.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          
          {server.chatParticipant?.enabled && (
            <>
              <span className="text-[var(--vscode-descriptionForeground)]">Name:</span>
              <div className="text-sm">
                {server.chatParticipant?.name || server.name}
              </div>
              
              <span className="text-[var(--vscode-descriptionForeground)]">Description:</span>
              <div className="text-sm">
                {server.chatParticipant?.description || `Tools for ${server.name}`}
              </div>
              
              <span className="text-[var(--vscode-descriptionForeground)]">Sticky:</span>
              <div className="flex items-center">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "w-fit",
                    server.chatParticipant?.isSticky ? "bg-blue-500/10 text-blue-500 border-blue-500/30" : "bg-gray-500/10 text-gray-500 border-gray-500/30"
                  )}
                >
                  {server.chatParticipant?.isSticky ? "Yes" : "No"}
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Environment variables section */}
      {serverType === ServerType.PROCESS && server.env && Object.keys(server.env).length > 0 && (
        <Collapsible 
          open={showEnvVars} 
          onOpenChange={setShowEnvVars} 
          className="border dark-border rounded p-2"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between p-1 hover:bg-[var(--vscode-list-hoverBackground)] rounded">
            <div className="flex items-center gap-2">
              <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", showEnvVars && "rotate-90")} />
              <h4 className="text-xs font-medium">
                Environment Variables <span className="text-[var(--vscode-descriptionForeground)]">({Object.keys(server.env).length})</span>
              </h4>
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="pt-2 space-y-2">
            <ScrollArea className="max-h-[150px]">
              <div className="grid grid-cols-[1fr_1fr] gap-1 text-xs">
                {Object.entries(server.env).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <div className="font-medium truncate px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded-l group hover:bg-[var(--vscode-editor-inactiveSelectionBackground)]/70 cursor-default">
                      {key}
                    </div>
                    <div className="truncate text-[var(--vscode-descriptionForeground)] px-2 py-1 bg-[var(--vscode-editor-inactiveSelectionBackground)] rounded-r group hover:bg-[var(--vscode-editor-inactiveSelectionBackground)]/70 cursor-default">
                      {value}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Tools section - collapsible version */}
      {serverWithDefaults.tools && serverWithDefaults.tools.length > 0 && (
        <Collapsible 
          open={showTools} 
          onOpenChange={setShowTools} 
          className="border dark-border rounded p-2"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between p-1 hover:bg-[var(--vscode-list-hoverBackground)] rounded">
            <div className="flex items-center gap-2">
              <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", showTools && "rotate-90")} />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
                Tool Schemas <span className="opacity-80">({serverWithDefaults.tools.length})</span>
              </h4>
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="pt-2 space-y-1 text-lg">
            <ScrollArea className="h-fit">
              {serverWithDefaults.tools.map((tool) => (
                <Collapsible
                  key={tool.name}
                  open={expandedTool === tool.name}
                  onOpenChange={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                >
                  <CollapsibleTrigger className="flex w-full items-center p-1 gap-2 hover:bg-[var(--vscode-list-hoverBackground)] rounded text-left">
                    <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", expandedTool === tool.name && "rotate-90")} />
                    <div className="flex items-center gap-2">
                      <ListTree className="h-3 w-3 text-[var(--vscode-descriptionForeground)]" />
                      <span className="text-xs font-medium">{tool.name}</span>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="pl-6 pr-2 py-2">
                    <div className="text-xs text-[var(--vscode-descriptionForeground)] border-l-2 border-[var(--vscode-widget-border)] pl-2 space-y-2">
                      <p>{tool.description}</p>
                      <div className="pt-1">
                        <div className="text-[0.65rem] uppercase font-semibold text-[var(--vscode-descriptionForeground)] h-fit mb-1">Schema</div>
                        <pre className="overflow-x-auto bg-[var(--vscode-terminal-background)]/90 p-2 rounded-md text-[0.7rem] w-full">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t dark-border">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditServer()}
          className="text-xs dark-steel-button"
        >
          <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-xs bg-red-600 hover:bg-red-700 text-white"
        >
          <Trash className="h-3.5 w-3.5 mr-1.5" /> Remove
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Card
        className={cn(
          "h-auto overflow-hidden group transition-all duration-200 steel-card w-full flex flex-col flex-nowrap",
          isLocalExpanded && "border-[var(--steel-accent)]/70",
          className
        )}
      >
        <CardHeader className="p-3 card-header">
          <Collapsible 
            open={isLocalExpanded}
            onOpenChange={(open: boolean) => {
              console.log(`[ServerCard] ${server.name}: Local expansion state changing to ${open}`);
              // Update local state
              setIsLocalExpanded(open);
              // Notify parent component if callback is provided
              console.log(`[ServerCard] ${server.name}: Notifying parent of expansion state change to ${open}`);
              if (onOpenChange) {
                onOpenChange(open);
              }
            }}
          >
            <CollapsibleTrigger asChild>
              <div className="cursor-pointer w-full hover:bg-[var(--vscode-list-hoverBackground)] rounded p-1">
                {renderCardHeader()}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              {renderExpandedContent()}
            </CollapsibleContent>
          </Collapsible>
        </CardHeader>
      </Card>
      
      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="w-[90vw] max-w-[400px] min-w-[300px] bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] border-[var(--vscode-widget-border)]">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[var(--vscode-errorForeground)]" />
              Remove Server
            </DialogTitle>
            <DialogDescription className="text-[var(--vscode-descriptionForeground)]">
              Are you sure you want to remove the server "{server.name}"?
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-[var(--vscode-errorForeground)]/10 p-3 rounded flex items-start gap-2 my-2">
            <Info className="h-4 w-4 text-[var(--vscode-errorForeground)] mt-0.5 flex-shrink-0" />
            <p className="text-sm text-[var(--vscode-errorForeground)]">
              This action cannot be undone. The server will be removed from your configuration.
            </p>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              className="border-[var(--vscode-button-border)] dark-steel-button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveServer}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
