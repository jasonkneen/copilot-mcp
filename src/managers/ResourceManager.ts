// import * as vscode from 'vscode';

// import { Resource } from "@modelcontextprotocol/sdk/types";
// import { MCPClientManager } from '@automatalabs/mcp-client-manager';

// /**
//  * ResourceManager handles registration and management of MCP resources
//  */
// export class ResourceManager {
//     private _resourceRegistrations: Map<string, vscode.Disposable[]> = new Map();
//     private _resourceInstances: Resource[] = [];
//     private _context: vscode.ExtensionContext;

//     constructor(context: vscode.ExtensionContext) {
//         this._context = context;
//     }

//     /**
//      * Register resources from an MCP client
//      * @param serverId The server ID
//      * @param client The MCP client
//      * @param resources The resources to register
//      */
//     public async registerResources(serverId: string, client: MCPClientManager, resources: Resource[]): Promise<void> {
//         try {
//             const registrations: vscode.Disposable[] = [];

//             // Create a Set of existing resource URIs to prevent duplicates
//             const existingResourceUris = new Set(this._resourceInstances.map(r => r.uri));

//             for (const resource of resources) {
//                 try {
//                     console.log(`Registering resource: ${resource.name}`);
                    
//                     // Skip if resource is already registered
//                     if (existingResourceUris.has(resource.uri)) {
//                         console.log(`Resource with URI ${resource.uri} already registered, skipping`);
//                         continue;
//                     }

//                     const command = `copilot-mcp.${resource.name}`;

//                     const commandHandler = async () => {
//                         try {
//                             console.log(`Reading resource: ${resource.name}`);
//                             const resourceContent = await client.getClientResources(serverId);
//                             const foundResource = resourceContent.find(r => r.uri === resource.uri);
//                             if (!foundResource) {
//                                 throw new Error(`Resource ${resource.name} not found`);
//                             }
//                             console.log('Resource content:', foundResource);
//                             return foundResource;
//                             // You could do something with the resource content here,
//                             // like showing it in a webview or text document
//                         } catch (error) {
//                             console.error(`Error reading resource ${resource.name}:`, error);
//                             vscode.window.showErrorMessage(`Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
//                         }
//                     };

//                     const registration = vscode.commands.registerCommand(command, commandHandler);
//                     registrations.push(registration);
                    
//                     // Add to our resource instances if not already there
//                     if (!this._resourceInstances.some(r => r.uri === resource.uri)) {
//                         this._resourceInstances.push(resource);
//                     }
                    
//                     console.log(`Registered resource: ${resource.name}`);
//                 } catch (error) {
//                     console.error(`Register Resource ${resource.name} error:`, error);
//                 }
//             }

//             if (registrations.length > 0) {
//                 // Store registrations for cleanup
//                 this._resourceRegistrations.set(serverId, registrations);
                
//                 // Add to extension subscriptions for cleanup
//                 this._context.subscriptions.push(...registrations);
                
//                 console.log(`Registered ${registrations.length} resources for server ${serverId}`);
//             }
//         } catch (error) {
//             console.error(`Register Resources for Server ${serverId} error:`, error);
//         }
//     }

//     /**
//      * Unregister resources for a server
//      * @param serverId The server ID
//      */
//     public unregisterResources(serverId: string): void {
//         try {
//             const registrations = this._resourceRegistrations.get(serverId);
//             if (registrations) {
//                 // Dispose all resource registrations
//                 registrations.forEach(registration => registration.dispose());
//                 this._resourceRegistrations.delete(serverId);
                
//                 // We could remove the resources from _resourceInstances here,
//                 // but for simplicity, we'll keep them in memory
                
//                 console.log(`Unregistered ${registrations.length} resources for server ${serverId}`);
//             }
//         } catch (error) {
//             console.error(`Unregister Resources for Server ${serverId} error:`, error);
//         }
//     }

//     /**
//      * Get all registered resources
//      * @returns An array of registered resources
//      */
//     public getAllResources(): Resource[] {
//         return this._resourceInstances;
//     }
    
//     /**
//      * Refresh resources for a server
//      * @param serverId The server ID
//      * @param client The MCP client
//      * @param resources The updated resources
//      */
//     public async refreshResourcesForServer(serverId: string, client: MCPClientManager, resources: Resource[]): Promise<void> {
//         try {
//             // First unregister existing resources
//             this.unregisterResources(serverId);
            
//             // Register the updated resources
//             await this.registerResources(serverId, client, resources);
            
//             console.log(`Refreshed resources for server ${serverId}: ${resources.length} resources`);
//         } catch (error) {
//             console.error(`Refresh Resources for Server ${serverId} error:`, error);
//         }
//     }
    
//     /**
//      * Dispose all resources
//      */
//     public dispose(): void {
//         try {
//             // Dispose all resource registrations
//             for (const [serverId, registrations] of this._resourceRegistrations.entries()) {
//                 for (const registration of registrations) {
//                     registration.dispose();
//                 }
//                 console.log(`Disposed ${registrations.length} resources for server ${serverId}`);
//             }
            
//             this._resourceRegistrations.clear();
//             this._resourceInstances = [];
            
//             console.log('Resource manager disposed');
//         } catch (error) {
//             console.error('Dispose Resource Manager error:', error);
//         }
//     }
// }