
# VSCode MCP Tool Servers Extension – Implementation Plan

## Overview

This plan outlines the architecture and steps to implement a VS Code extension that bridges **Model Context Protocol (MCP)** servers with VS Code’s Language Model API. The extension will allow dynamic registration of tools from one or more MCP servers so that GitHub Copilot (or any VS Code-integrated LLM) can invoke those tools. Key features include a **UI panel** for managing servers, automatic server start/stop, real-time status updates, and dynamic tool registration via `vscode.lm.registerTool`. The following sections break down the implementation by UI, configuration, server lifecycle management, tool registration, and error handling.

## 1. Configuration and Setup of MCP Servers

To manage multiple MCP servers, define a configuration (e.g., an array in extension settings) that lists each server and its properties. Each server entry can include: a unique name/id, the launch **command or endpoint** (for local or remote servers), and an **enabled/disabled** flag. This configuration can be stored in the user settings or extension global state so it persists between sessions. For example, in `package.json` contribute a configuration schema:

```json
"contributes": {
  "configuration": {
    "title": "MCP Tool Servers",
    "properties": {
      "mcp.servers": {
        "type": "array",
        "description": "List of MCP server configurations",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "Server name" },
            "command": { "type": "string", "description": "Launch command or URL for the server" },
            "args": { "type": "array", "items": { "type": "string" }, "description": "(Optional) Command arguments" },
            "enabled": { "type": "boolean", "description": "Enable this server", "default": true }
          }
        }
      }
    }
  }
}
```

On extension activation, read this configuration and prepare to start each configured server. The VS Code API `workspace.getConfiguration` can retrieve and update these settings. For example:

```typescript
const config = vscode.workspace.getConfiguration('mcp');
const servers: ServerConfig[] = config.get<ServerConfig[]>('servers', []);

// Example: Adding a new server config (from user input)
servers.push({ name: "MyMCP", command: "/path/to/mcp-server", args: ["--port", "3000"], enabled: true });
await config.update('servers', servers, vscode.ConfigurationTarget.Global);
```

This approach ensures changes to server configurations (through the UI or settings) are persisted. We will also watch for configuration changes to dynamically apply updates without requiring a VS Code reload. Use `vscode.workspace.onDidChangeConfiguration` to listen for edits to `mcp.servers` and respond by starting/stopping servers as needed.

## 2. Extension UI – MCP Servers Panel

Create a custom **sidebar panel** (or tree view) named “MCP Servers” to display the list of configured servers. Each entry in the panel should show the server’s name and its current **status** (e.g., “Running”, “Stopped”, “Error”). We will use a `TreeDataProvider` to supply tree items for each server. The tree items can have context-specific actions (via context menu or inline buttons) for **Enable/Disable**, **Remove**, and possibly **Refresh**. A top-level “Add Server” action will allow users to configure a new server via an input form or quick input prompts.

**UI Behavior:**

- **List & Status**: The tree view iterates through the `mcp.servers` configuration array to show each server. Status can be indicated by an icon or a description text. For example, a green dot icon for “running”, red for “error”, gray for “stopped/disabled”. The label is the server’s friendly name or address.
- **Add Server**: Clicking “Add Server” triggers a command that collects details (name, command or URL, etc.) from the user (using `vscode.window.showInputBox` and similar). The new server config is appended to `mcp.servers` and the TreeDataProvider is refreshed to show it.
- **Remove Server**: Each server item will have a context menu action or a small “trash” button. Selecting it will remove that entry from the config and stop the server if it’s running.
- **Enable/Disable Toggle**: A checkbox or toggle button can quickly enable or disable a server. Disabling will stop the server and unregister its tools; enabling will start it up and register tools. The UI should update the status accordingly.

Using a TreeDataProvider, we can implement the `getTreeItem` method to customize the display. For example:

```typescript
class McpServerItem extends vscode.TreeItem {
  constructor(public server: ServerConfig) {
    super(server.name, vscode.TreeItemCollapsibleState.None);
    this.description = server.enabled ? serverStatusMap[server.name] || "Stopped" : "Disabled";
    this.contextValue = server.enabled ? "serverEnabled" : "serverDisabled";
    // Set iconPath based on status (omitted for brevity)
  }
}
```

Here, `serverStatusMap` could be a dictionary tracking runtime status (updated by the server management logic). The `contextValue` allows us to conditionally show menu items (e.g., “Enable” when disabled, or “Disable” when enabled). After any action (add/remove/toggle), call `treeDataProvider.refresh()` to update the view. For instance, after toggling a server:

```typescript
server.enabled = false;
serverStatusMap[server.name] = "Disabled";
treeDataProvider.refresh(serverItem);
```

This updates the specific item’s status in the UI. We’ll also display error messages in the UI (for example, setting `serverStatusMap[server.name] = "Error"` with details on hover) if a server fails to start or its tools fail to load.

## 3. Server Management (Start/Stop/Restart)

Managing the MCP server processes is a core part of the extension. **On extension activation**, iterate over all configured servers and **auto-start** each one that is enabled. There are two modes to support: launching a local process (using stdio) or connecting to an existing server over HTTP/SSE. The MCP TypeScript SDK provides client transports for both modes:

- **Local Process (stdio)**: Use the SDK’s `StdioClientTransport` to spawn the server as a subprocess, communicating via standard I/O ([@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk#:~:text=import%20,modelcontextprotocol%2Fsdk%2Fclient%2Fstdio.js)). For example:
    
    ```typescript
    import { Client } from "@modelcontextprotocol/sdk/client";
    import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
    
    const transport = new StdioClientTransport({
      command: serverConfig.command, 
      args: serverConfig.args || []
    });
    const client = new Client({ name: "vscode-mcp-client", version: "1.0.0" }, { 
      capabilities: { prompts: {}, resources: {}, tools: {} }
    });
    try {
      await client.connect(transport);
      console.log(`Connected to MCP server: ${serverConfig.name}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to start MCP server '${serverConfig.name}': ${err}`);
      serverStatusMap[serverConfig.name] = "Error";
      treeDataProvider.refresh(findTreeItem(serverConfig.name));
      return;
    }
    ```
    
    In this snippet, `command` might be the path to a Node script or binary that runs the MCP server. Upon calling `connect`, the client starts the process and establishes communication. The `capabilities` object indicates we intend to use prompts, resources, and tools from the server. If the connection fails (throws an error), we catch it, update the UI status to "Error", and notify the user.
    
- **Remote Server (HTTP+SSE)**: To connect to an already running MCP server (e.g., on a URL), use an SSE transport. The MCP protocol defines a streaming SSE endpoint for receiving events and a POST endpoint for sending commands ([Model Context Protocol | LangChain4j](https://docs.langchain4j.dev/tutorials/mcp/#:~:text=McpTransport%20transport%20%3D%20new%20HttpMcpTransport,build)). We can utilize an `SSEClientTransport` (from the SDK) if available, or implement one. For example:
    
    ```typescript
    import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse";
    // Assume serverConfig.url is the base URL like "http://localhost:3000"
    const transport = new SSEClientTransport({
      sseUrl: `${serverConfig.url}/sse`,
      postUrl: `${serverConfig.url}/messages`
    });
    const client = new Client({ name: "vscode-mcp-client", version: "1.0.0" }, { capabilities: { tools: {} }});
    await client.connect(transport);
    ```
    
    This will connect to the MCP server via HTTP. (The exact SDK API for SSE transport may differ; the key idea is we provide the correct URLs for SSE and message post.) Once connected, the usage of the `client` is the same. If the server is not reachable or returns an error, handle it similar to the local case (update status and alert the user).
    
- **Tracking and Restarting**: Keep a map of active `client` instances and possibly child process handles for each server. On **disable**, call a cleanup routine: if it’s a local process, kill it (e.g., `childProcess.kill()`); if remote, invoke the client disconnect (if provided) or simply stop listening. Also dispose any tools registered for that server (detailed in the next section). On **enable** (or config change) for a server that was off, initialize a new transport and client and connect again.
    
- **Auto-stop on VSCode Close**: Use `extensionContext.subscriptions` to push disposables for each running server/client. In the extension’s `deactivate` function (or via the disposables), ensure all processes are killed and connections closed. For example:
    
    ```typescript
    context.subscriptions.push(new vscode.Disposable(() => {
      for (const server of runningServers) {
        server.client.disconnect?.();
        server.process?.kill();
      }
    }));
    ```
    

By structuring server management this way, the extension will automatically maintain the correct set of running servers and handle reconnections when the configuration changes (e.g., if the user edits the settings or uses the UI toggles). Any failure to start or an unexpected server exit should be caught: update the status to "Error" and show a notification so the user is aware.

## 4. Tool Retrieval and Dynamic Registration

Once a client is connected to an MCP server, the extension needs to fetch the list of tools that server provides, then register each as a VS Code language model tool. MCP servers expose a **`tools/list`** request that returns all available tools with details ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=,calculations%20to%20complex%20API%20interactions)). We can call this via the SDK client (assuming a method like `client.listTools()` or a generic RPC call). For example:

```typescript
let tools: MCPToolDefinition[];
try {
  tools = await client.listTools();  // Retrieves tool definitions from the server
} catch (err) {
  vscode.window.showErrorMessage(`Failed to retrieve tools from ${serverConfig.name}: ${err}`);
  serverStatusMap[serverConfig.name] = "Error";
  treeDataProvider.refresh(findTreeItem(serverConfig.name));
  return;
}
```

Each `MCPToolDefinition` might look like:

```typescript
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: object;  // JSON Schema for inputs
  // possibly other fields like output schema or tags
}
```

Using this information, create a VS Code tool adapter that implements the `vscode.LanguageModelTool` interface. The adapter’s job is to forward invocations to the MCP server and return results. We can define a class (or factory function) for this. For instance:

```typescript
class MCPToolAdapter implements vscode.LanguageModelTool {
  name: string;
  displayName: string;
  description?: string;
  modelDescription?: string;
  inputSchema: any;  // JSON schema for tool input

  constructor(private toolDef: MCPToolDefinition, private client: Client) {
    this.name = toolDef.name;
    this.displayName = toolDef.name;               // could use a nicer name if available
    this.description = toolDef.description;        // shown to user in UI
    this.modelDescription = toolDef.description;   // description for the model’s benefit
    this.inputSchema = toolDef.inputSchema;
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<any>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    // Forward the tool call to the MCP server
    const args = options.input;
    const result = await this.client.callTool({ name: this.toolDef.name, arguments: args });
    // Assume result.content is an array of output parts (text, etc.) from the MCP tool
    const outputText = result.content?.map(part => part.text || '').join('') || '';
    // Wrap the output in a LanguageModelToolResult to return to VS Code
    return new vscode.LanguageModelToolResult([ new vscode.LanguageModelTextPart(outputText) ]);
  }
}
```

In this adapter:

- `name` is the unique tool identifier (as defined by the server).
- `displayName` and `description` are set for human readability. We reuse the MCP tool’s description for both user UI and model usage (they could be distinct if needed).
- `inputSchema` is directly taken from the MCP tool definition (already a JSON Schema describing the parameters). This informs VS Code/Copilot of the tool’s expected input structure.
- The `invoke` method calls `client.callTool(...)` with the tool name and user-provided arguments. The SDK’s `callTool` will perform the `tools/call` request to the MCP server and return the result. We then convert the result into a `LanguageModelToolResult`. In this case, if the MCP result has a text output, we create a `LanguageModelTextPart` containing that text ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=return%20new%20vscode.LanguageModelToolResult%28,else)). (For more complex outputs, we could handle different content types, but text suffice for most cases.)

After creating the adapter instance, register the tool with VS Code’s API. The `vscode.lm.registerTool` function takes a tool name and an implementation of `LanguageModelTool`, returning a `Disposable` that can unregister the tool when disposed ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=2,registerTool)). For example:

```typescript
const disposables: vscode.Disposable[] = [];
for (const toolDef of tools) {
  const toolImpl = new MCPToolAdapter(toolDef, client);
  const disp = vscode.lm.registerTool(toolDef.name, toolImpl);
  disposables.push(disp);
}
runningServers[serverConfig.name] = { client, disposables };
serverStatusMap[serverConfig.name] = "Running";  // update status to running with tools ready
treeDataProvider.refresh(findTreeItem(serverConfig.name));
```

Here we keep track of the disposables in a `runningServers` map alongside the client. This makes it easy to clean up later. We also update the UI status to “Running” now that tools are successfully registered. At this point, the tools from this server are available to the VS Code language model API. This means GitHub Copilot (or any other AI extension using VS Code’s LM API) can discover and invoke these tools dynamically. The LLM will see the `inputSchema` and description and may choose to call the tool when appropriate.

**Unregistering Tools:** If a server is disabled or stops, we must unregister its tools to avoid stale entries. We can dispose the stored disposables for that server:

```typescript
function unregisterServerTools(serverName: string) {
  const entry = runningServers[serverName];
  if (!entry) return;
  for (const disp of entry.disposables) {
    disp.dispose();  // Unregisters the tool from VS Code
  }
  entry.disposables = [];
}
```

Call `unregisterServerTools` when a server is toggled off or removed. Also, if the extension deactivates, dispose of all tool registrations as part of the cleanup.

## 5. Status Updates and Error Handling

Robust error handling ensures a good user experience. The extension should handle and communicate errors at various stages:

- **Server Start Failures**: If a server process fails to launch (e.g., bad command or crash) or a network server is unreachable, catch the error. Mark the server’s status as “Error” and use `vscode.window.showErrorMessage` to alert the user (as shown in code above). The UI panel can show an error icon or tooltip with the error message for that server.
    
- **Tool Retrieval Failures**: If `tools/list` fails or returns no tools, handle it similarly. Possibly show “Error (no tools)” status. The extension could retry connecting after some delay or let the user manually retry (e.g., via a Refresh action).
    
- **Runtime Errors**: If a tool invocation throws an exception during `client.callTool`, catch it and return an error result to the language model. For example, one could throw a `UserError` that VS Code will surface in the chat. Additionally, log these errors to the extension output channel for debugging.
    
- **UI Refresh**: Whenever a status changes (starting, running, stopped, error), call `treeDataProvider.refresh()`. The `getTreeItem` should reflect the updated status. For instance, upon a successful start:
    
    ```typescript
    serverStatusMap[name] = "Running";
    vscode.window.showInformationMessage(`MCP server '${name}' is running with ${tools.length} tools.`);
    treeDataProvider.refresh(findTreeItem(name));
    ```
    
    And on stop/error:
    
    ```typescript
    serverStatusMap[name] = "Stopped";
    vscode.window.showWarningMessage(`MCP server '${name}' has been stopped.`);
    treeDataProvider.refresh(findTreeItem(name));
    ```
    

By providing immediate visual feedback and notifications, the user is kept informed of the system state.

## 6. Summary of Steps

**Initialization**: On activation, load server configs, create the MCP Servers panel, and start each enabled server.  
**Server Launch**: For each server, either spawn a subprocess or connect via SSE, then retrieve its tools.  
**Tool Registration**: For each tool obtained, instantiate a tool adapter and register it with `vscode.lm.registerTool` ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=2,registerTool)). Tools become available to Copilot/LLM immediately.  
**Dynamic Updates**: When the user adds a new server via UI, update configuration and start it. When the user toggles off a server, stop it and unregister its tools. Listen for `onDidChangeConfiguration` to handle manual config file edits as well (trigger restarts or shutdowns accordingly).  
**Shutdown**: On extension deactivation or VS Code closing, ensure all server processes are terminated and all tool registrations disposed.

Following this plan will result in a VS Code extension that cleanly manages multiple MCP servers and exposes their tools to the AI assistant. The extension UI provides an at-a-glance view of server statuses and easy controls to add or remove integrations. With this setup, GitHub Copilot can query the VS Code API to discover the newly registered tools and invoke them as needed, enabling powerful new capabilities driven by external MCP tool servers. The design emphasizes clarity, modularity (separating UI, server management, and tool bridging), and error resilience to create a seamless user experience.