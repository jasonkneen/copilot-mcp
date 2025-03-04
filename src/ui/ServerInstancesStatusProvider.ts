import * as vscode from 'vscode';
import { InstanceManager, InstanceEvents, ServerInstance } from '../utils/InstanceManager';
import { Logger } from '../utils/Logger';

/**
 * Provides a status bar in the webview for displaying server instances
 */
export class ServerInstancesStatusProvider {
    private instanceManager: InstanceManager;
    private logger: Logger;
    private serverViewProvider: any; // Will be set when registered
    private statusUpdateInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.instanceManager = InstanceManager.getInstance();
        this.logger = Logger.getInstance();

        // Listen for instance changes
        InstanceManager.getInstance().on(InstanceEvents.INSTANCES_CHANGED, this.handleInstancesChanged.bind(this));
    }

    /**
     * Register the status provider with a server view provider
     * @param serverViewProvider The server view provider to register with
     */
    public register(serverViewProvider: any): void {
        this.serverViewProvider = serverViewProvider;
        
        // Start periodic status updates
        this.startStatusUpdates();
        
        this.logger.log('[ServerInstancesStatusProvider] Registered with server view provider');
    }

    /**
     * Start periodic status updates
     */
    private startStatusUpdates(): void {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        
        // Update the status every 10 seconds
        this.statusUpdateInterval = setInterval(() => {
            this.updateStatus();
        }, 10000);
        
        // Do an initial update
        this.updateStatus();
    }

    /**
     * Stop periodic status updates
     */
    public stopStatusUpdates(): void {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
    }

    /**
     * Handle instances changed event
     */
    private handleInstancesChanged(instances: ServerInstance[]): void {
        this.updateStatus();
    }

    /**
     * Update the status bar
     */
    private updateStatus(): void {
        if (!this.serverViewProvider) {
            return;
        }
        
        const instances = this.instanceManager.getAllInstances();
        const runningInstances = instances.filter(i => i.status === 'running');
        const errorInstances = instances.filter(i => i.status === 'error');
        
        // Group instances by server name
        const instancesByServer = new Map<string, ServerInstance[]>();
        for (const instance of instances) {
            if (!instancesByServer.has(instance.serverName)) {
                instancesByServer.set(instance.serverName, []);
            }
            instancesByServer.get(instance.serverName)?.push(instance);
        }
        
        // Create status data for the webview
        const statusData = {
            totalInstances: instances.length,
            runningCount: runningInstances.length,
            errorCount: errorInstances.length,
            instancesByServer: Object.fromEntries(instancesByServer),
            servers: Array.from(instancesByServer.keys()),
            timestamp: new Date().toISOString()
        };
        
        // Send the status update to the webview
        try {
            this.serverViewProvider.updateInstancesStatus(statusData);
        } catch (error) {
            this.logger.error(`[ServerInstancesStatusProvider] Failed to update status: ${error}`);
        }
    }

    /**
     * Kill a server instance
     * @param instanceId The instance ID to kill
     */
    public killInstance(instanceId: string): boolean {
        return this.instanceManager.killInstance(instanceId);
    }

    /**
     * Restart servers by name
     * @param serverName The server name to restart
     */
    public async restartServers(serverName: string): Promise<boolean> {
        const instances = this.instanceManager.getInstancesByServer(serverName);
        if (instances.length === 0) {
            return false;
        }
        
        // Stop all instances for this server
        for (const instance of instances) {
            if (instance.status === 'running') {
                this.instanceManager.killInstance(instance.id);
            }
        }
        
        // Let the server view provider handle restarting them
        // This will be implemented in the server view provider
        if (this.serverViewProvider && this.serverViewProvider.restartServer) {
            await this.serverViewProvider.restartServer(serverName);
            return true;
        }
        
        return false;
    }
    
    /**
     * Clean up stale instances
     */
    public cleanupStaleInstances(): void {
        this.instanceManager.cleanupStaleInstances();
        this.updateStatus();
    }
}