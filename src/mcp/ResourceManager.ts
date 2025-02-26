import * as vscode from 'vscode';
import { Resource } from '@modelcontextprotocol/sdk/types';
import { MCPClientWrapper } from './MCPClientWrapper';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { ServerEventType, ServerEvent } from '../server/ServerConfig';
import { EventBus } from '../utils/EventBus';

/**
 * Manages MCP resources across servers
 */
export class ResourceManager {
    private _resourcesMap: Map<string, Resource[]> = new Map();
    private _resourceInstances: Resource[] = [];
    private _registrations: Map<string, vscode.Disposable[]> = new Map();
    private _logger?: Logger;

    /**
     * Creates a new resource manager
     * @param context The extension context
     */
    constructor(private readonly context: vscode.ExtensionContext) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }

        // Subscribe to server events
        this._setupEventListeners();
    }

    /**
     * Set up event listeners for server events
     */
    private _setupEventListeners(): void {
        // Listen for resource changes
        const resourcesChangedSubscription = EventBus.onEvent(event => {
            if (event.type === ServerEventType.RESOURCES_CHANGED) {
                if (this._logger) {
                    this._logger.log(`Resources changed for server ${event.serverId}, updating registrations`);
                }
                this._handleResourcesChanged(event);
            }
        });

        // Listen for server stopped events to clean up resources
        const serverStoppedSubscription = EventBus.onEvent(event => {
            if (event.type === ServerEventType.SERVER_STOPPED) {
                if (this._logger) {
                    this._logger.log(`Server ${event.serverId} stopped, unregistering resources`);
                }
                this.unregisterResources(event.serverId);
            }
        });

        // Add subscriptions to the extension context for proper disposal
        this.context.subscriptions.push(resourcesChangedSubscription, serverStoppedSubscription);
    }

    /**
     * Handle resources changed event
     * @param event The resources changed event
     */
    private async _handleResourcesChanged(event: ServerEvent): Promise<void> {
        if (!event.data?.resources || !Array.isArray(event.data.resources)) {
            return;
        }

        const resources = event.data.resources as Resource[];
        const mcpClient = event.data.mcpClient as MCPClientWrapper;

        if (mcpClient && resources.length > 0) {
            await this.registerResources(event.serverId, mcpClient, resources);
        }
    }

    /**
     * Register resources for a server
     * @param serverId The server ID
     * @param mcpClient The MCP client
     * @param resources The resources to register
     */
    public async registerResources(serverId: string, mcpClient: MCPClientWrapper, resources: Resource[]): Promise<void> {
        // Unregister existing resources for this server
        await this.unregisterResources(serverId);

        // Store the new resources
        this._resourcesMap.set(serverId, resources);

        // Update the combined list of all resources
        this._updateResourceInstances();

        const registrations: vscode.Disposable[] = [];

        for (const resource of resources) {
            try {
                if (!resource.name || !resource.uri) {
                    if (this._logger) {
                        this._logger.warn(`Skipping resource with missing name or URI: ${JSON.stringify(resource)}`);
                    }
                    continue;
                }

                // Create a command to read the resource
                const commandId = `mcp-resource.${resource.name}`;

                const commandHandler = async () => {
                    try {
                        if (this._logger) {
                            this._logger.log(`Reading resource: ${resource.name} (${resource.uri})`);
                        }

                        const resourceContent = await mcpClient.readResource(resource.uri);

                        // Display the resource content
                        this._displayResourceContent(resource, resourceContent);

                        return resourceContent;
                    } catch (error) {
                        ErrorHandler.handleError(`Read Resource: ${resource.name}`, error);
                        return null;
                    }
                };

                // Register the command
                const registration = vscode.commands.registerCommand(commandId, commandHandler);
                registrations.push(registration);

                if (this._logger) {
                    this._logger.log(`Registered resource command: ${commandId}`);
                }
            } catch (error) {
                ErrorHandler.handleError(`Register Resource: ${resource.name}`, error);
            }
        }

        // Store the registrations
        if (registrations.length > 0) {
            this._registrations.set(serverId, registrations);
            this.context.subscriptions.push(...registrations);

            if (this._logger) {
                this._logger.log(`Registered ${registrations.length} resources for server ${serverId}`);
            }
        }
    }

    /**
     * Unregister resources for a server
     * @param serverId The server ID
     */
    public async unregisterResources(serverId: string): Promise<void> {
        // Remove from resources map
        this._resourcesMap.delete(serverId);

        // Update combined resources list
        this._updateResourceInstances();

        // Dispose command registrations
        const registrations = this._registrations.get(serverId);
        if (registrations) {
            for (const registration of registrations) {
                registration.dispose();
            }

            this._registrations.delete(serverId);

            if (this._logger) {
                this._logger.log(`Unregistered ${registrations.length} resources for server ${serverId}`);
            }
        }
    }

    /**
     * Update the combined list of all resources
     */
    private _updateResourceInstances(): void {
        this._resourceInstances = Array.from(this._resourcesMap.values()).flat();
    }

    /**
     * Display resource content in an appropriate way
     * @param resource The resource metadata
     * @param content The resource content
     */
    private _displayResourceContent(resource: Resource, content: any): void {
        try {
            // Extract text from content based on MCP format
            let textContent = '';
            let title = `Resource: ${resource.name}`;

            if (content?.contents && Array.isArray(content.contents)) {
                // Handle standard MCP format with contents array
                for (const item of content.contents) {
                    if (typeof item.text === 'string') {
                        textContent += item.text + '\n';
                    } else if (item.blob && typeof item.blob === 'string') {
                        // Handle base64 encoded content
                        try {
                            const decoded = Buffer.from(item.blob, 'base64').toString('utf-8');
                            textContent += decoded + '\n';
                        } catch (error) {
                            textContent += `[Binary content: ${item.blob.substring(0, 20)}...]\n`;
                        }
                    }
                }
            } else if (typeof content === 'string') {
                // Handle simple string responses
                textContent = content;
            } else if (content?.text) {
                // Handle object with text property
                textContent = typeof content.text === 'string'
                    ? content.text
                    : JSON.stringify(content.text, null, 2);
            } else {
                // Fallback to JSON stringification
                textContent = JSON.stringify(content, null, 2);
            }

            // Determine the right way to display the content
            if (resource.mimeType?.startsWith('image/')) {
                // For images, we could display differently
                vscode.window.showInformationMessage(`Image resource: ${resource.name} (${resource.mimeType})`);
            } else {
                // For text content, show in an editor
                this._showTextDocument(title, textContent);
            }
        } catch (error) {
            ErrorHandler.handleError('Display Resource', error);
            vscode.window.showErrorMessage(`Failed to display resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Show text content in an editor
     * @param title Document title
     * @param content Text content
     */
    private async _showTextDocument(title: string, content: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument({
            content: content,
            language: 'markdown' // Use markdown as default for better formatting
        });

        await vscode.window.showTextDocument(document, { preview: true });
    }

    /**
     * Get all resources across servers
     * @returns Array of all resources
     */
    public getAllResources(): Resource[] {
        return [...this._resourceInstances];
    }

    /**
     * Get resources for a specific server
     * @param serverId The server ID
     * @returns Array of server's resources
     */
    public getServerResources(serverId: string): Resource[] {
        return this._resourcesMap.get(serverId) || [];
    }

    /**
     * Find a resource by URI
     * @param uri The resource URI
     * @returns The resource if found
     */
    public findResourceByUri(uri: string): Resource | undefined {
        return this._resourceInstances.find(r => r.uri === uri);
    }

    /**
     * Dispose and clean up resources
     */
    public dispose(): void {
        // Dispose all registrations
        for (const registrations of this._registrations.values()) {
            for (const registration of registrations) {
                registration.dispose();
            }
        }

        this._registrations.clear();
        this._resourcesMap.clear();
        this._resourceInstances = [];

        if (this._logger) {
            this._logger.log('Resource manager disposed');
        }
    }
} 