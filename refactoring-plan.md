# MCP Server Extension Refactoring Plan

After reviewing the extension code, the MCP server integration code would benefit from refactoring. The current implementation has several issues including large classes with too many responsibilities, mixed concerns, and scattered error handling. Here's a comprehensive refactoring plan to make the code more maintainable:

## 1. Separate Concerns

Currently, the `MCPServerViewProvider` class is doing too much. Let's break it down:

```
class MCPServerViewProvider {
   // Currently handles:
   // - UI/Webview management
   // - Server process management 
   // - MCP client communication
   // - Tool registration
   // - Resource handling
   // - Chat handling
   // ...and more
}
```

### Proposed Structure:

```
- src/
  - extension.ts (entry point)
  - server/
    - ServerManager.ts (manages server lifecycle)
    - ServerConfig.ts (server configuration interfaces)
    - ServerProcess.ts (process handling)
  - mcp/
    - MCPClient.ts (MCP client wrapper)
    - ToolManager.ts (tool registration)
    - ResourceManager.ts (resource handling)
  - ui/
    - ServerViewProvider.ts (webview UI)
    - WebviewMessage.ts (message interfaces)
  - chat/
    - ChatHandler.ts (chat participant logic)
  - utils/
    - Logger.ts (centralized logging)
```

## 2. Class Responsibilities

### `ServerManager` Class
```typescript
class ServerManager {
    private _servers: ServerConfig[] = [];
    private _processes: Map<string, ServerProcess> = new Map();
    
    constructor(private context: vscode.ExtensionContext) {}
    
    // Load/save server configurations
    public loadServers(): Promise<ServerConfig[]> {}
    public saveServers(): Promise<void> {}
    
    // Server lifecycle
    public startServer(server: ServerConfig): Promise<void> {}
    public stopServer(serverId: string): Promise<void> {}
    public restartServer(serverId: string): Promise<void> {}
    
    // Event handlers
    public onServerStarted(callback: (serverId: string) => void): vscode.Disposable {}
    public onServerStopped(callback: (serverId: string) => void): vscode.Disposable {}
    
    // Cleanup
    public dispose(): void {}
}
```

### `MCPClientManager` Class
```typescript
class MCPClientManager {
    private _clients: Map<string, MCPClient> = new Map();
    
    // MCP client initialization
    public async connectClient(serverId: string, process: ChildProcess): Promise<MCPClient> {}
    
    // MCP API interactions
    public async getTools(serverId: string): Promise<Tool[]> {}
    public async getResources(serverId: string): Promise<Resource[]> {}
    public async callTool(serverId: string, toolName: string, args: any): Promise<any> {}
    
    // Cleanup
    public dispose(): void {}
}
```

### `ToolManager` Class
```typescript
class ToolManager {
    private _toolRegistrations: Map<string, vscode.Disposable[]> = new Map();
    private _toolInstances: vscode.LanguageModelChatTool[] = [];
    
    constructor(private context: vscode.ExtensionContext) {}
    
    // Tool registration
    public async registerTools(serverId: string, client: MCPClient, tools: Tool[]): Promise<void> {}
    public async unregisterTools(serverId: string): Promise<void> {}
    
    // Tool access
    public getAllTools(): vscode.LanguageModelChatTool[] {}
    
    // Cleanup
    public dispose(): void {}
}
```

## 3. Error Handling Improvements

Implement a centralized error handling approach:

```typescript
class ErrorHandler {
    public static handleError(
        context: string, 
        error: unknown, 
        outputChannel?: vscode.OutputChannel,
        showToUser: boolean = true
    ): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${context}] Error: ${errorMessage}`);
        
        if (outputChannel) {
            outputChannel.appendLine(`Error in ${context}: ${errorMessage}`);
        }
        
        if (showToUser) {
            vscode.window.showErrorMessage(`${context}: ${errorMessage}`);
        }
    }
}
```

## 4. Communication Improvements

Create a clear messaging protocol between components:

```typescript
// Event bus for internal communication
class EventBus {
    private static _events = new vscode.EventEmitter<ServerEvent>();
    
    public static onEvent(listener: (e: ServerEvent) => any): vscode.Disposable {
        return this._events.event(listener);
    }
    
    public static emit(event: ServerEvent): void {
        this._events.fire(event);
    }
}

// Event types
interface ServerEvent {
    type: 'server-started' | 'server-stopped' | 'tools-changed' | 'resources-changed';
    serverId: string;
    data?: any;
}
```

## 5. MCP Client Improvements

Create a more robust MCP client wrapper:

```typescript
class MCPClientWrapper {
    private client: MCPClient;
    private outputChannel: vscode.OutputChannel;
    
    constructor(serverId: string, process: ChildProcess, outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }
    
    public async connect(): Promise<void> {
        // Connection logic with retry mechanism
    }
    
    public async listTools(): Promise<Tool[]> {
        // With error handling
    }
    
    public async listResources(): Promise<Resource[]> {
        // With better error handling for unsupported methods
    }
    
    public async callTool(params: CallToolRequest["params"]): Promise<any> {
        // With reconnection logic if needed
    }
    
    public dispose(): void {
        // Cleanup
    }
}
```

## 6. Implementation Strategy

1. **Create a feature branch** for this refactoring
2. **Extract interfaces first** to define the contracts between components
3. **Implement each component** one at a time, starting with the core functionality
4. **Gradually migrate** from the old implementation to the new one
5. **Write tests** for each component as you go
6. **Update the UI last**, once the core functionality is working

## 7. Specific Improvements for the Method Not Found Error

For the specific issue with the "Method not found" error, create a more robust approach:

```typescript
async listResources(): Promise<Resource[]> {
    try {
        const resourcesResponse = await this.client.listResources();
        return resourcesResponse.resources ?? [];
    } catch (error) {
        if (this.isMethodNotSupportedError(error)) {
            this.outputChannel.appendLine('Note: This MCP server does not support resource listing');
            return [];
        }
        throw error;
    }
}

private isMethodNotSupportedError(error: unknown): boolean {
    return error instanceof Error && 
           (error.message.includes('Method not found') || 
            error.message.includes('-32601'));
}
```

## 8. Extension Activation Improvements

Simplify the activation sequence in extension.ts:

```typescript
export async function activate(context: vscode.ExtensionContext) {
    try {
        const logger = new Logger(context);
        const serverManager = new ServerManager(context);
        const mcpClientManager = new MCPClientManager();
        const toolManager = new ToolManager(context);
        const resourceManager = new ResourceManager(context);
        
        // Create UI components with dependency injection
        const viewProvider = new ServerViewProvider(
            context, 
            serverManager, 
            mcpClientManager,
            toolManager,
            resourceManager
        );
        
        // Register commands, views and event handlers
        registerExtensionCommands(context, serverManager, viewProvider);
        registerViewProviders(context, viewProvider);
        setupEventHandlers(serverManager, mcpClientManager, toolManager, resourceManager);
        
        // Create chat participant
        registerChatParticipant(context, toolManager, resourceManager);
        
        // Start enabled servers
        await serverManager.startEnabledServers();
        
        logger.log('Extension activated successfully');
    } catch (error) {
        console.error('Error during extension activation:', error);
        vscode.window.showErrorMessage(`Failed to activate MCP extension: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
``` 