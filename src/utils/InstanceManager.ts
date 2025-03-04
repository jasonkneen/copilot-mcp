import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Logger } from './Logger';
import { EventBus } from './EventBus';

/**
 * Interface representing server instance information
 */
export interface ServerInstance {
  id: string;
  pid: number;
  serverPath: string;
  serverName: string;
  launchSource: string; // 'cli' or extension ID
  startTime: number;
  serverConfig: string;
  contextInfo: Record<string, any>;
  connectionType: 'sse' | 'stdio';
  lastHealthCheck?: number;
  status: 'running' | 'stopped' | 'error';
}

/**
 * Events emitted by the InstanceManager
 */
export enum InstanceEvents {
  INSTANCE_ADDED = 'instance_added',
  INSTANCE_REMOVED = 'instance_removed',
  INSTANCE_STATUS_CHANGED = 'instance_status_changed',
  INSTANCES_CHANGED = 'instances_changed'
}

/**
 * Manages server instances across CLI and extension contexts
 */
export class InstanceManager {
  private static instance: InstanceManager;
  private instances: Map<string, ServerInstance> = new Map();
  private instancesDir: string;
  private healthCheckInterval?: NodeJS.Timeout;
  private eventBus = EventBus.getInstance();
  private logger = Logger.getInstance();

  private constructor() {
    this.instancesDir = path.join(os.homedir(), '.mcpsx', 'instances');
    this.ensureInstancesDirectory();
    this.loadInstances();
    this.startHealthCheck();
  }

  /**
   * Gets the singleton instance of InstanceManager
   */
  public static getInstance(): InstanceManager {
    if (!InstanceManager.instance) {
      InstanceManager.instance = new InstanceManager();
    }
    return InstanceManager.instance;
  }

  /**
   * Ensures the instances directory exists
   */
  private ensureInstancesDirectory(): void {
    try {
      if (!fs.existsSync(this.instancesDir)) {
        fs.mkdirSync(this.instancesDir, { recursive: true });
      }
    } catch (error) {
      Logger.getInstance().error(`Failed to create instances directory: ${error}`);
    }
  }

  /**
   * Loads all instance records from the filesystem
   */
  private loadInstances(): void {
    try {
      const files = fs.readdirSync(this.instancesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.instancesDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const instance = JSON.parse(content) as ServerInstance;
            this.instances.set(instance.id, instance);
          } catch (error) {
            Logger.getInstance().error(`Failed to parse instance file: ${filePath}: ${error}`);
          }
        }
      }
      Logger.getInstance().log(`Loaded ${this.instances.size} instance records`);
    } catch (error) {
      Logger.getInstance().error(`Failed to load instance records: ${error}`);
    }
  }

  /**
   * Saves an instance record to the filesystem
   */
  private saveInstance(instance: ServerInstance): void {
    try {
      const filePath = path.join(this.instancesDir, `${instance.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(instance, null, 2));
    } catch (error) {
      Logger.getInstance().error(`Failed to save instance: ${instance.id}: ${error}`);
    }
  }

  /**
   * Registers a new server instance
   */
  public registerInstance(
    pid: number,
    serverPath: string,
    serverName: string,
    launchSource: string,
    serverConfig: string,
    contextInfo: Record<string, any>,
    connectionType: 'sse' | 'stdio'
  ): string {
    const id = `${serverName}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const instance: ServerInstance = {
      id,
      pid,
      serverPath,
      serverName,
      launchSource,
      startTime: Date.now(),
      serverConfig,
      contextInfo,
      connectionType,
      lastHealthCheck: Date.now(),
      status: 'running'
    };

    this.instances.set(id, instance);
    this.saveInstance(instance);
    EventBus.getInstance().emit(InstanceEvents.INSTANCE_ADDED, instance);
    EventBus.getInstance().emit(InstanceEvents.INSTANCES_CHANGED, this.getAllInstances());
    return id;
  }

  /**
   * Removes a server instance
   */
  public removeInstance(id: string): boolean {
    if (!this.instances.has(id)) {
      return false;
    }

    try {
      const filePath = path.join(this.instancesDir, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      const instance = this.instances.get(id);
      this.instances.delete(id);
      
      EventBus.getInstance().emit(InstanceEvents.INSTANCE_REMOVED, instance);
      EventBus.getInstance().emit(InstanceEvents.INSTANCES_CHANGED, this.getAllInstances());
      return true;
    } catch (error) {
      Logger.getInstance().error(`Failed to remove instance: ${id}: ${error}`);
      return false;
    }
  }

  /**
   * Updates an instance's status
   */
  public updateInstanceStatus(id: string, status: 'running' | 'stopped' | 'error'): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    instance.status = status;
    instance.lastHealthCheck = Date.now();
    this.saveInstance(instance);
    
    EventBus.getInstance().emit(InstanceEvents.INSTANCE_STATUS_CHANGED, instance);
    EventBus.getInstance().emit(InstanceEvents.INSTANCES_CHANGED, this.getAllInstances());
    return true;
  }

  /**
   * Gets all instances as an array
   */
  public getAllInstances(): ServerInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Gets instances for a specific server
   */
  public getInstancesByServer(serverName: string): ServerInstance[] {
    return this.getAllInstances().filter(instance => instance.serverName === serverName);
  }

  /**
   * Gets an instance by ID
   */
  public getInstance(id: string): ServerInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Checks if a process is still running
   */
  private isPidRunning(pid: number): boolean {
    try {
      return process.kill(pid, 0);
    } catch (e) {
      return false;
    }
  }

  /**
   * Performs health checks on all instances
   */
  private performHealthCheck(): void {
    for (const instance of this.instances.values()) {
      // Check if the process is still running
      const isRunning = this.isPidRunning(instance.pid);
      
      if (!isRunning && instance.status === 'running') {
        Logger.getInstance().warn(`Instance ${instance.id} (PID: ${instance.pid}) is no longer running`);
        this.updateInstanceStatus(instance.id, 'error');
      } else if (instance.status === 'running') {
        instance.lastHealthCheck = Date.now();
        this.saveInstance(instance);
      }
    }
  }

  /**
   * Starts the health check interval
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  /**
   * Stops the health check interval
   */
  public stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Kills a server instance
   */
  public killInstance(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    try {
      process.kill(instance.pid);
      this.updateInstanceStatus(id, 'stopped');
      return true;
    } catch (error) {
      Logger.getInstance().error(`Failed to kill instance ${id}: ${error}`);
      return false;
    }
  }

  /**
   * Cleans up stale instances
   */
  public cleanupStaleInstances(): void {
    for (const instance of this.instances.values()) {
      if (instance.status === 'running') {
        const isRunning = this.isPidRunning(instance.pid);
        if (!isRunning) {
          Logger.getInstance().warn(`Removing stale instance ${instance.id} (PID: ${instance.pid})`);
          this.removeInstance(instance.id);
        }
      }
    }
  }
  
  /**
   * Subscribe to events from this instance manager
   * @param event Event name
   * @param handler Handler function
   * @returns Disposable to unsubscribe
   */
  public on(event: string, handler: (data: any) => void): { dispose: () => void } {
    return this.eventBus.on(event, handler);
  }
}