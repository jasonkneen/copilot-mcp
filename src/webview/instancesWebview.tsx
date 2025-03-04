// This file will be built with webpack for the instances webview

import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import { InstancesStatusData, ServerInstance } from './types';
import { Badge } from "@/components/ui/badge";
import { 
  RefreshCw, 
  Terminal, 
  Activity, 
  Circle 
} from 'lucide-react';


// Simple utility function to format a timestamp
function formatUptime(timestamp: number): string {
    try {
        const startTime = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - startTime.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        
        if (diffSec < 60) {
            return `${diffSec}s`;
        } else if (diffSec < 3600) {
            const min = Math.floor(diffSec / 60);
            const sec = diffSec % 60;
            return `${min}m ${sec}s`;
        } else {
            const hours = Math.floor(diffSec / 3600);
            const min = Math.floor((diffSec % 3600) / 60);
            return `${hours}h ${min}m`;
        }
    } catch (e) {
        return 'Invalid time';
    }
}

// Format date/time in readable format
function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// Reusable CollapsibleSection component
interface CollapsibleSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

// We'll implement this component with plain HTML/CSS since we don't have the UI components library
// that App.tsx is using

// Component for displaying a single instance
const InstanceItem: React.FC<{
    instance: ServerInstance;
    onKill: (id: string) => void;
}> = ({ instance, onKill }) => {
    return (
        <div className={`instance-item status-${instance.status}`}>
            <div className="instance-info">
                <div className="instance-header">
                    <span className="instance-name">{instance.serverName}</span>
                    <span className={`status-badge ${instance.status}`}>
                        {instance.status}
                    </span>
                </div>
                <div className="instance-details">
                    <div>PID: {instance.pid}</div>
                    <div>Uptime: {formatUptime(instance.startTime)}</div>
                    {instance.launchSource && (
                        <div>Source: {instance.launchSource}</div>
                    )}
                </div>
            </div>
            <div className="instance-actions">
                <button
                    className="kill-button"
                    onClick={() => onKill(instance.id)}
                    title="Kill this instance"
                >
                    Stop
                </button>
            </div>
        </div>
    );
};

// Component for a server group
const ServerGroup: React.FC<{
    serverName: string;
    instances: ServerInstance[];
    onKill: (id: string) => void;
}> = ({ serverName, instances, onKill }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const runningCount = instances.filter(i => i.status === 'running').length;
    const errorCount = instances.filter(i => i.status === 'error').length;
    
    return (
        <div className="server-group">
            <div 
                className="server-group-header" 
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="expand-icon">{isExpanded ? '▼' : '►'}</span>
                <span className="server-name">{serverName}</span>
                <div className="instance-count">
                    {runningCount > 0 && (
                        <span className="count-badge running">
                            {runningCount} running
                        </span>
                    )}
                    {errorCount > 0 && (
                        <span className="count-badge error">
                            {errorCount} error
                        </span>
                    )}
                </div>
            </div>
            {isExpanded && (
                <div className="server-instances">
                    {instances.map(instance => (
                        <InstanceItem 
                            key={instance.id} 
                            instance={instance} 
                            onKill={onKill}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Main App component
const App: React.FC = () => {
    const [statusData, setStatusData] = useState<InstancesStatusData | null>(null); 
    const [instanceStatusFilter, setInstanceStatusFilter] = useState<'running' | 'error' | 'stopped' | 'all'>('running');
    const [confirmingKillId, setConfirmingKillId] = useState<string | null>(null);
    
    // Handle messages from the extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;
            
            switch (message.type) {
                case 'updateInstancesStatus':
                    setStatusData(message.data);
                    break;
            }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Request initial status
        window.vscodeApi.postMessage({ type: 'getInstancesStatus' });
        
        // Clean up
        return () => {
            window.removeEventListener('message', messageHandler);
        };
    }, []);

    // Kill an instance
    const handleKillInstance = (id: string) => {
        // Set the ID to trigger confirmation dialog
        setConfirmingKillId(id);
    };
    
    // Confirm kill and execute
    const confirmKill = () => {
        if (confirmingKillId) {
            window.vscodeApi.postMessage({ type: 'killInstance', id: confirmingKillId });
            setConfirmingKillId(null);
        }
    };
    
    // Cancel kill confirmation
    const cancelKill = () => {
        setConfirmingKillId(null);
    };
    
    // Refresh instances
    const handleRefresh = () => {
        window.vscodeApi.postMessage({ type: 'refreshInstances' });
    };
    
    // Filter instances based on selected instanceStatusFilter
    const filterInstances = (instances: ServerInstance[]): ServerInstance[] => {
        if (instanceStatusFilter === 'all') return instances;
        return instances.filter(i => i.status === instanceStatusFilter);
    };
    
    // Prepare server data for display
    const prepareServerData = (): { serverName: string, instances: ServerInstance[] }[] => {
        if (!statusData || !statusData.instancesByServer) return [];
        
        // Convert to array and sort
        return Object.entries(statusData.instancesByServer)
            .map(([serverName, instances]) => ({
                serverName,
                instances: filterInstances(instances)
            }))
            .filter(group => group.instances.length > 0)
            .sort((a, b) => a.serverName.localeCompare(b.serverName));
    };
    
    const servers = prepareServerData();
    const hasInstances = servers.length > 0;
    
    // Get counts for the filter badges
    const totalCount = statusData?.totalInstances || 0;
    const runningCount = statusData?.runningCount || 0;
    const errorCount = statusData?.errorCount || 0;
    
    return (
        <div className="instances-container">
            
           <div className="filter-container">
                <div className="filter-buttons">
                    <button 
                        className={`filter-button ${instanceStatusFilter === 'running' ? 'active' : ''}`}
                        onClick={() => setInstanceStatusFilter('running')}
                    >
                        Running ({runningCount})
                    </button>
                    <button 
                        className={`filter-button ${instanceStatusFilter === 'error' ? 'active' : ''}`}
                        onClick={() => setInstanceStatusFilter('error')}
                    >
                        Error ({errorCount})
                    </button>
                    <button 
                        className={`filter-button ${instanceStatusFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setInstanceStatusFilter('all')}
                    >
                        All ({totalCount})
                    </button>
                </div>
                <button className="refresh-button" onClick={handleRefresh}>
                    Refresh
                </button>
            </div>
            
            <div className="instances-content">
                {hasInstances ? (
                    servers.map(server => (
                        <div key={server.serverName} className="server-group">
                            <div className="server-header">
                                <div className="server-title">{server.serverName}</div>
                                <div className="instance-count">{server.instances.length} running {server.instances.length === 1 ? 'instance' : 'instances'}</div>
                            </div>
                            
                            {server.instances.map(instance => (
                                 <div key={instance.id} className="instance-item">
                                   <div className="instance-main">
                                        <div className="instance-name">
                                            {instance.serverName}
                                            <div className="instance-pid">
                                                PID: {instance.pid} | {instance.connectionType.toUpperCase()}
                                            </div>
                                        </div>
                                        
                                        <div className="instance-status">
                                             <div className={`status-pill ${instance.status}`}>
                                                {instance.status}
                                           </div>
                                            
                                            {instance.status === 'running' && (
                                                <button 
                                                    className="kill-button"
                                                    onClick={() => handleKillInstance(instance.id)}
                                                 >
                                                   STOP
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="instance-details">
                                        <div className="time-block">
                                            <div className="time-label">Started</div>
                                            <div className="time-value">
                                                {new Date(instance.startTime).toLocaleString()}
                                             </div>
                                       </div>
                                        
                                        <div className="time-block">
                                            <div className="time-label">Uptime</div>
                                            <div className="time-value">
                                                {formatUptime(instance.startTime)}
                                            </div>
                                        </div>
                                     </div>
                               </div>
                            ))}
                        </div>
                    ))
                ) : (
                    <div className="no-instances">
                        <div className="no-instances-message">
                            No {instanceStatusFilter === 'all' ? '' : instanceStatusFilter} instances found
                        </div>
                    </div>
                )}
            </div>
            
            {/* Confirmation Dialog */}
            {confirmingKillId && (
                <div className="confirmation-overlay">
                    <div className="confirmation-dialog">
                        <div className="confirmation-title">Confirm Action</div>
                        <div className="confirmation-message">
                            Are you sure you want to stop this instance?
                        </div>
                        <div className="dialog-actions">
                            <button className="cancel-button" onClick={cancelKill}>
                                Cancel
                            </button>
                            <button className="confirm-button" onClick={confirmKill}>
                                Stop Instance
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {statusData && (
                <div className="status-footer">
                     <div className="running-count">{runningCount} running instances</div>
                     <div className="last-updated-time">
                        Last updated: {new Date(statusData.timestamp).toLocaleTimeString()}
                     </div>
                </div>
            )}
            
            <style>{`
                :root {
                    --dark-border: var(--vscode-panel-border);
                    --green-500: #4caf50;
                    --blue-500: #2196f3;
                    --glass-bg: rgba(30, 30, 30, 0.7);
                    --glass-border: rgba(255, 255, 255, 0.1);
                    --green-600: #43a047;
                    --green-700: #388e3c;
                    --red-600: #e53935;
                    --red-500: #f44336;
                    --gray-400: #9e9e9e;
                    --vscode-foreground: var(--vscode-editor-foreground);
                    --vscode-background: var(--vscode-editor-background);
                    --vscode-panel-background: var(--vscode-sideBar-background);
                    --vscode-border-color: var(--vscode-panel-border);
                    --dark-panel-bg: #1a1a1a;
                    --running-color: var(--green-500);
                    --error-color: #f44336;
                    --warning-color: #ff9800;
                }

                * {
                    box-sizing: border-box;
                }
                
                body {
                    background-color: var(--background);
                     background-color: var(--dark-panel-bg);
                     color: #ffffff;
                     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                     margin: 0;
                     padding: 0;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    margin: 0;
                    padding: 0;
                    font-size: 13px;
                }
                
                .instances-container {
                    display: flex;
                    flex-direction: column;
                    background-color: var(--dark-panel-bg);
                    padding: 16px;
                    height: 100%;
                }
                
                .header-container {
                    display: flex;
                    justify-content: flex-start;
                    align-items: center;
                    margin-bottom: 16px;
                }
                
                .panel-title {
                    font-size: 20px;
                    font-weight: 500;
                    margin: 0 16px 0 0;
                }
                
                .header-actions {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    margin-left: auto;
                }
                
                .instances-summary {
                    display: flex;
                    flex-direction: column;
                    margin-bottom: 16px;
                }
                
                .running-count {
                    font-size: 12px;
                    text-align: right;
                }
                
                .last-updated {
                    font-size: 12px;
                    color: #aaaaaa;
                    margin-top: 4px;
                    text-align: right;
                }
                
                .filter-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    border-radius: 10px;
                }
                
                .filter-buttons {
                    display: flex;
                    background-color: var(--glass-bg);
                    border: 1px solid var(--glass-border);
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                    overflow: hidden;
                }
                
                .filter-button {
                    background-color: transparent;
                    border: none;
                    color: #ffffff;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 13px;
                }
                
                .filter-button.active {
                    background-color: #4caf50;
                    background-image: linear-gradient(180deg, #4caf50, #43a047);
                    font-weight: 500;
                 }
                
                .refresh-button {
                    background-color: #4caf50;
                    border: none;
                    color: white;
                    padding: 6px 16px;
                    border-radius: 10px;
                    cursor: pointer;
                    background-image: linear-gradient(180deg, #4caf50, #43a047);
                    font-size: 13px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(4px);
                }
                
                .refresh-button:hover {
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                    background-color: #43a047;
                }
                
                .instances-content {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    flex: 1;
                    overflow-y: auto;
                }
                
                .server-group {
                    border: 1px solid var(--glass-border);
                    background-color: var(--vscode-editor-background);
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(10px);
                    overflow: hidden;
                }
                
                .server-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: var(--vscode-editor-background);
                    padding: 8px 12px;
                }
                
                .server-title {
                    font-weight: 500;
                }
                
                .instance-count {
                    font-size: 12px;
                    color: #aaaaaa;
                }
                
                .instance-item {
                    padding: 12px;
                    border-top: 1px solid var(--glass-border);
                    background-color: var(--vscode-editor-background);
                }
                
                .instance-main {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom:0px;
                }
                
                .instance-name {
                    font-weight: 500;
                }
                
                .instance-pid {
                    font-size: 12px;
                    color: #aaaaaa;
                    margin-top: 2px;
                }
                
                .instance-status {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .status-pill {
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(4px);
                    font-weight: 500;
                }
                
                .status-pill.running {
                    background-color: transparent;
                    border: 1px solid #4caf50;
                    color: #4caf50;
                }
                
                .status-pill.error {
                    background-color: #f44336;
                    color: white;
                }
                
                .instance-details {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 8px;
                }
                
                .kill-button {
                    background-color: #f44336;
                    border-radius: 4px;
                    color: white;
                    border: none;
                    padding: 4px 12px;
                    cursor: pointer; 
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(4px);
                    transition: all 0.2s ease;
                }
                
                .kill-button:hover {
                    background-color: #e53935;
                }
                
                .time-block {
                    display: flex;
                    flex-direction: column;
                    width: 48%;
                }
                
                .time-label {
                    font-size: 12px;
                    color: #aaaaaa;
                }
                
                .time-value {
                    margin-top: 2px;
                }
                
                .no-instances {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 32px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid #333333;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    border-radius: 8px;
                }
                
                .no-instances-message {
                    color: #aaaaaa;
                    font-size: 14px;
                }
                
                .server-group-header {
                    display: flex;
                    align-items: center;
                    padding: 8px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid #333333;
                    margin-bottom: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .expand-icon {
                    margin-right: 6px;
                }
                
                .server-name {
                    flex: 1;
                    font-weight: bold;
                }
                
                .instance-count {
                    display: flex;
                    gap: 6px;
                }
                
                .count-badge {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(4px);
                }
                
                .count-badge.running {
                    background-color: transparent;
                    border: 1px solid var(--running-color);
                    color: var(--running-color);
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                }
                
                .count-badge.error {
                    background-color: var(--error-color);
                    color: white;
                }
                
                .server-instances {
                     margin-top: 4px;
                     margin-left: 16px;
                }
                
                /* Apply steel-card styling only to the instance items within the server groups */
                .server-group > .instance-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px;
                    border: 1px solid hsl(220, 10%, 22%);
                    background: linear-gradient(to bottom, hsl(220, 8%, 17%), hsl(220, 8%, 15%));
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    margin-bottom: 4px;
                    transition: all 0.3s ease;
                }
                
                .server-group > .instance-item:hover {
                    border-color: var(--steel-accent);
                }
                
                .instance-info {
                    flex: 1;
                }
                
                .instance-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 4px;
                }
                
                .instance-name {
                    font-weight: bold;
                    margin-right: 8px;
                }
                
                .status-badge {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(4px);
                }
                
                .status-badge.running {
                    background-color: transparent;
                    border: 1px solid #4caf50; 
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                }
                
                .status-badge.error {
                    background-color: var(--error-color);
                    color: white;
                }
                
                .status-badge.stopped {
                    background-color: var(--vscode-descriptionForeground);
                    color: white;
                }
                
                .instance-details {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    display: flex;
                    gap: 12px;
                }
                
                .instance-actions {
                    display: flex;
                    gap: 8px;
                }
                
                .kill-button {
                    background-color: var(--error-color);
                    border-radius: 4px;
                    color: white;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                }
                
                .kill-button:hover {
                    background-color: #d32f2f;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                }
                
                .status-footer {
                    margin-top: 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    background-color: var(--vscode-editor-background);
                    padding: 8px;
                    border-radius: 8px;
                    border: 1px solid #333333;
                }
                
                .last-updated-time {
                    font-size: 11px;
                    color: #aaaaaa;
                }
                
                /* Confirmation Dialog Styles */
                .confirmation-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(4px);
                }
                
                .confirmation-dialog {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid #333333;
                    border-radius: 8px;
                    padding: 20px;
                    width: 400px;
                    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(10px);
                }
                
                .confirmation-title {
                    font-size: 18px;
                    font-weight: 500;
                    margin-bottom: 12px;
                    color: #ffffff;
                }
                
                .confirmation-message {
                    margin-bottom: 20px;
                    color: #cccccc;
                }
                
                .dialog-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    margin-top: 20px;
                }
                
                .cancel-button {
                    background-color: transparent;
                    border: 1px solid var(--blue-500);
                    color: #ffffff;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .cancel-button:hover {
                    background-color: rgba(33, 150, 243, 0.1);
                }
                
                .confirm-button {
                    background-color: #f44336;
                    color: white;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .confirm-button:hover {
                    background-color: #e53935;
                }
            `}</style>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);