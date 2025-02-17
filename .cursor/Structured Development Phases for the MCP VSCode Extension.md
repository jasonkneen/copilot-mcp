# Structured Development Phases for the MCP VSCode Extension

Below is a step-by-step breakdown of the extension implementation. Each phase is presented as a **prompt** guiding a coding agent through a logical development step. Every phase includes the goal, key details, expected outcome, and references to relevant VS Code API docs or best practices.

## Phase 1: Initialize Extension Project (TypeScript)

**Goal**: Set up a new VS Code extension project in TypeScript, including basic manifest entries and dependencies (React, etc.). Establish an activation point (e.g. a command) to verify the extension loads.

**Key Implementation Details**:

- Use VS Code’s Yeoman generator (`yo code`) or manual setup to scaffold a **TypeScript** extension project. This creates `package.json`, `tsconfig.json`, and a stub `extension.ts` (or `extension.js`) activation script.
- Add **React** and **React-DOM** as dependencies. Also set up a bundler (like **Webpack** or **Vite**) to handle JSX/TSX compilation for the UI. Ensure the build outputs (HTML/JS) can be loaded into a VSCode webview.
- Update `package.json` with extension metadata: name, publisher, etc., and include a sample **command** (e.g., `"mcpManager.openPanel"`) in the `contributes.commands` section to open the future UI panel. (This will help in testing activation.) ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=contributes)) ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=%7B%20,path%2Fto%2Fdark%2Ficon.svg))
- Include the VS Code type declarations (`@types/vscode`) and set `engines.vscode` to a minimum version supporting the `vscode.lm` API (VSCode 1.95+ as the Language Model API was proposed around that time). Also include `@modelcontextprotocol/sdk` in `package.json` for later use (MCP client SDK).

**Expected Output**:  
A basic extension project structure. Running `npm install` pulls in VS Code types, React, and necessary build tools. The extension activates (on command execution or on startup if you add `activationEvents`) and can run a dummy command (e.g., show a “Hello World” notification) to confirm the setup is working.

**References**:

- VS Code Extension Anatomy and **contribution points** (commands) ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=contributes)) ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=%7B%20,path%2Fto%2Fdark%2Ficon.svg)).
- Using **TypeScript** for VS Code extensions (scaffolding provides the structure).
- **React & Webpack** setup for VSCode extensions (e.g., _“Create React App in VSCode Webview”_ templates on GitHub – for later phases). No specific citation (general knowledge).

## Phase 2: Create a React-Based Webview UI Panel

**Goal**: Establish the user interface for managing MCP servers using a React component, rendered inside a VS Code Webview. The panel will later list configured servers and allow adding/removing them.

**Key Implementation Details**:

- **Contribute a Custom View**: In `package.json`, add a view container and view. For example, under `contributes.viewsContainers.activitybar`, define a new container (e.g., `"id": "mcpServers", "title": "MCP Servers"` with an icon), and under `contributes.views`, add a view with `id: "mcpServerManager"` in that container. This prepares a slot for our React UI panel in the VSCode UI (e.g., a new sidebar tab).
- **WebviewViewProvider**: Implement a class in extension code that extends `vscode.WebviewViewProvider`. Register it in `extension.activate` using `vscode.window.registerWebviewViewProvider("mcpServerManager", provider)`. In the provider’s `resolveWebviewView`, set up the webview’s HTML content to load the React app. Use the Webview API to serve an HTML with a `<div id="root"></div>` and a script tag for the bundled React code. The HTML should reference the script via `webview.asWebviewUri` (since the script will be in extension’s `media` or `dist` folder).
- **Bundle React**: Configure Webpack/Vite to compile the React TSX into a single JS bundle. The bundler should produce output in your extension’s `media` directory (or `out` if configured). Include this JS in the webview HTML. Ensure the webview is allowed to load local scripts by setting `webview.options = { enableScripts: true }`.
- **Basic React Component**: Create a simple React component (e.g., `App.tsx`) that renders a placeholder UI (like a title "MCP Server Manager" and maybe an empty list message). Mount this React app to the `root` div. Verify that when the view is opened (via the view container in sidebar or via the command), the React app loads and displays.
- Use VS Code’s webview messaging to prepare for interaction: call `acquireVsCodeApi()` in the webview script to get the VSCode API handle for messaging. No actual messages yet, just ensure it doesn’t error.

**Expected Output**:  
A React-based panel appears in VS Code (e.g., in a new sidebar section) with a basic UI. The extension successfully opens this panel, and the React component renders static content. This confirms the React app is integrated with the extension’s webview.

**References**:

- VS Code **Webview API** basics: _“The webview API allows extensions to create fully customizable views within Visual Studio Code.”_ ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=The%20webview%20API%20allows%20extensions,VS%20Code%27s%20native%20APIs%20support)) Webviews can be in panels or views; here we use a Webview **View** (sidebar) ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=Webviews%20are%20used%20in%20several,VS%20Code%20APIs)).
- **Webview View Sample** (VSCode docs or samples on GitHub) for how to register a `WebviewViewProvider`.
- **Webpack setup for VSCode webviews** (e.g., official Webview UI Toolkit example – general guidance).
- React integration in VSCode extensions (e.g., using `acquireVsCodeApi` in the webview script to communicate).

## Phase 3: UI for Managing Multiple MCP Server Configurations

**Goal**: Develop the React UI to display a list of MCP server configurations and provide controls to add, remove, and toggle servers on/off. At this phase, focus on the front-end logic and state management (the extension backend logic to actually start/stop servers will come later).

**Key Implementation Details**:

- **Define Server Config Model**: Decide what information represents a “server.” For example, a server config might include: `id` (unique identifier or name), `command` or `scriptPath` (to launch the server, e.g. path to a Python or Node script, or an address for remote), and a boolean `enabled` (on/off). It could also have `name` and maybe status (`running`/`stopped`), but status can be derived from `enabled` for now.
- **React State**: In the React `App` component, manage an array of server configurations as state. Initialize it empty or with some dummy entries for testing. Create a child component or JSX structure that lists each server entry with: a label (name or command), a toggle (e.g., a checkbox or switch for on/off), and a “Remove” button. Also include an “Add Server” button or form.
- **Add Server**: Implement a form (or simply a prompt for now) to add a new server. This could be a pair of input fields (Name and Command) and an “Add” button. When clicked, the React state updates to append a new server (default `enabled=false`).
- **Remove Server**: For each listed server, the “Remove” button will remove that entry from state.
- **Toggle On/Off**: The on/off toggle (checkbox or switch) should update the state for that server’s `enabled` property. In this phase, toggling is purely visual (we’ll hook it to actual start/stop logic later). You might disable editing of command while enabled is true (optional UX).
- **One-Way Messaging**: Plan to communicate these UI actions to the extension backend. When a user adds or removes a server, or toggles one, the webview should send a message to the extension so it can update the authoritative config and eventually act on it. Use the VS Code webview API’s messaging: call `vscode.postMessage({...})` from the webview for each action, with a payload like `{ type: 'addServer', server: {...} }`, `{ type: 'removeServer', id: ... }`, `{ type: 'toggleServer', id: ..., enabled: ... }`. In the extension (the WebviewViewProvider), listen to `webview.onDidReceiveMessage` to handle these events. (At this stage, handlers can just log the actions or update an in-memory list.)
- **Two-Way Sync**: Also plan to send the initial list of servers from extension to webview upon opening. For example, in `resolveWebviewView`, after setting up HTML, do `webview.postMessage({ type: 'init', servers: [...] })` to send any persisted configs to the UI. The UI should listen for the `'message'` event (using `window.addEventListener('message', event => ...)`) and initialize state from `event.data.servers` on an 'init' message ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=An%20extension%20can%20send%20data,event)).

**Expected Output**:  
An interactive UI panel where the user can add a new server entry (appearing in the list), remove entries, and toggle them on/off (the toggle state changes in the UI). These actions should send messages to the extension (verify by logging or using VSCode’s debugger). No actual server processes start yet – this is purely the UI and messaging scaffold. The extension and webview maintain a synchronized list of server configs via message passing.

**References**:

- VS Code Webview **message passing**: _“An extension can send data to its webviews using `webview.postMessage()`. ... The message is received inside the webview through the standard `message` event.”_ ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=An%20extension%20can%20send%20data,event)). Also, from webview to extension via `acquireVsCodeApi().postMessage`.
- **Webview sample (Cat Coding)** – demonstrates using `window.addEventListener('message', ...)` in the webview and `panel.webview.onDidReceiveMessage` in extension ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=of%20lines%29.%20The%20new%20,itself%20to%20handle%20the%20message)) ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=using%20a%20,hand%20it%20out%20to%20any)).
- React state management for lists (general React docs for dynamic lists).
- Design note: For toggles, consider using a VS Code-like toggle UI component (the VS Code webview UI toolkit provides some, but you can also use plain checkbox).

## Phase 4: Persisting Configuration and Reacting to Changes

**Goal**: Ensure that the list of configured servers is saved between sessions and that changes to configuration (from the UI or settings) are handled. Use VS Code’s Settings API or global state to persist the configurations. Also reflect external config edits if any.

**Key Implementation Details**:

- **Contribute Settings Schema**: In `package.json`, add a configuration contribution so the user’s settings can store MCP server configs. For example:
    
    ```json
    "contributes": {
      "configuration": {
        "title": "MCP Server Manager",
        "properties": {
          "mcp.servers": {
            "type": "array",
            "description": "List of configured MCP servers (name, command, etc.)",
            "default": []
          }
        }
      }
    }
    ```
    
    This allows VS Code to know about `mcp.servers` setting (though editing an array of objects via JSON might be needed).
- **Load Initial Config**: In the extension activate (or when the webview is shown), retrieve the stored server list. Use `vscode.workspace.getConfiguration('mcp').get('servers')` to fetch the array ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=,example)). If it’s empty or undefined (first run), start with an empty list or maybe one sample entry for demo. Pass this list to the webview (via the ‘init’ message as in Phase 3).
- **Save on Changes**: When the UI sends add/remove/toggle messages, update the extension’s in-memory list _and also persist to settings_. Use `vscode.workspace.getConfiguration('mcp').update('servers', newServerList, vscode.ConfigurationTarget.Global)` to update the user setting. This will save the list in `settings.json`. Ensure to handle this asynchronously (the update returns a Promise).
- **Watch for External Changes**: Register an event handler for `vscode.workspace.onDidChangeConfiguration`. Check if `event.affectsConfiguration('mcp.servers')`. If so, retrieve the new value and update the extension’s list and notify the webview if it’s open. This covers cases where the user (or settings sync) edits the JSON directly outside our UI. The webview should update to reflect the new list (send an ‘init’ or specific diff message).
- **Uniqueness and Validation**: Optionally, enforce unique names or ids for servers when adding. Validate that command paths exist (if possible) when saving. In this phase, simple checks (e.g., non-empty fields) are fine – deeper validation can be done when starting the server.

**Expected Output**:  
The extension now remembers server configurations across sessions. If you reload VS Code, the MCP Servers panel shows the previously added servers. Adding/removing/toggling servers in the UI updates the VS Code setting (you can verify by checking your user `settings.json`). Likewise, manual edits to the `mcp.servers` setting (as an array) will reflect in the UI (the extension catches the change event and syncs the webview). This establishes a single source of truth for configurations.

**References**:

- **Configuration contribution** (settings) example: VS Code docs on contributes.configuration (e.g., defining settings in package.json) ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=%7B%20,functions%20with%20their%20parameter%20signature)) ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=You%20can%20read%20these%20values,vscode.workspace.getConfiguration%28%27myExtension)).
- Reading extension settings: _“You can read these values from your extension using `vscode.workspace.getConfiguration('myExtension')`.”_ ([Contribution Points | Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points#:~:text=You%20can%20read%20these%20values,vscode.workspace.getConfiguration%28%27myExtension)).
- **Updating settings** via the Configuration API (no direct doc snippet, but usage is `getConfiguration().update(...)`).
- Listening to config changes: `workspace.onDidChangeConfiguration` (VS Code API reference).

## Phase 5: Manage MCP Server Processes (Start/Stop)

**Goal**: Implement the backend logic to actually start and stop MCP server processes for each configured server when toggled. The extension will launch the server (if it’s a local script or command) and terminate it on demand. This includes tracking the process and basic logging of output or errors.

**Key Implementation Details**:

- **Spawning Process**: When a server’s `enabled` state switches to true (from the UI toggle message), use Node’s `child_process.spawn` to start the server process. The command and arguments should come from the server config. For example, if config has `{command: "python", args: ["/path/to/server.py"]}` or a single string that includes both, parse accordingly. Use `spawn(command, args, { cwd: ..., env: ... })` as needed. Ensure `stdio` is set to `"pipe"` (default) so we can read output. The spawn call is async but returns a ChildProcess object immediately ([Child process | Node.js v23.8.0 Documentation](https://nodejs.org/api/child_process.html#:~:text=const%20ls%20%3D%20spawn%28%27ls%27%2C%20%5B%27,usr)).
- **Store Process Handles**: Keep a map or object in the extension code mapping server IDs to their ChildProcess instance and maybe related data (like running status). This allows tracking which servers are running.
- **Process Lifecycle**: Attach event listeners to the ChildProcess:
    - `child.stdout.on('data', ...)` and `child.stderr.on('data', ...)` to log output (for debugging or future use). You might buffer output if needed (e.g., if the MCP protocol expects to read responses, but for now just log to console or output channel). ([Child process | Node.js v23.8.0 Documentation](https://nodejs.org/api/child_process.html#:~:text=ls.stdout.on%28%27data%27%2C%20%28data%29%20%3D,))
    - `child.on('close', code => { ... })` to handle unexpected exit ([Child process | Node.js v23.8.0 Documentation](https://nodejs.org/api/child_process.html#:~:text=ls.stderr.on%28%27data%27%2C%20%28data%29%20%3D,)). If code is non-zero or process exits quickly, treat it as an error (maybe notify user). Mark the server as not running (update internal state and UI).
- **Stopping Process**: When a server is toggled off, or removed, stop its process. Use `childProcess.kill()` to terminate. Also consider cleaning up listeners and removing it from the map. Before killing, you might send a gentle termination (if the server can handle a signal or a command to shut down). But `.kill()` with default signal should suffice for now.
- **UI Feedback**: Update the UI to reflect process status. For example, when a server is toggled on, you might optimistically mark it as “starting/running” (so the toggle stays on). If the process exits or fails, send a message to the webview to update that server’s status (and perhaps automatically toggle it off in the UI with an error state). This can be done via `webview.postMessage({ type: 'serverStatus', id: X, running: false, error: '...'})` etc. In React, use this message to update state (perhaps a `status` field per server).
- **Multiple Servers**: Ensure that each server’s process is handled independently. Starting one server shouldn’t stop another. If a user toggles on two servers, spawn two processes and track both. Also, consider what happens if two servers have the same config/command – they both should run if needed (assuming different IDs).
- **Transport Consideration**: We are starting servers likely to communicate via stdio (MCP default). We haven’t yet hooked up the protocol, but ensure we **don’t close** the process’s stdio streams prematurely. Just keep them open for now.

**Expected Output**:  
Toggling a server “On” actually launches the corresponding MCP server process in the background. The extension’s debug console (or an output channel if you route it) will show the server’s stdout/stderr or at least a log that the process started. Toggling “Off” will terminate the process. If the process crashes or exits, the extension detects it and updates the UI (e.g., turns the toggle off and could display an error). At this point, the extension can **manage multiple processes** concurrently, though the processes are not yet hooked into the VSCode LM API.

**References**:

- **Node.js Child Processes**: Using `child_process.spawn` to launch external commands (non-blocking) ([Child process | Node.js v23.8.0 Documentation](https://nodejs.org/api/child_process.html#:~:text=The%20child_process,either%20exits%20or%20is%20terminated)) ([Child process | Node.js v23.8.0 Documentation](https://nodejs.org/api/child_process.html#:~:text=const%20ls%20%3D%20spawn%28%27ls%27%2C%20%5B%27,usr)). The example illustrates spawning an `ls` process and capturing output.
- Best practice: handle `stdout`, `stderr`, and the `close` event to avoid zombie processes and to capture output for debugging ([Child process | Node.js v23.8.0 Documentation](https://nodejs.org/api/child_process.html#:~:text=ls.stdout.on%28%27data%27%2C%20%28data%29%20%3D,)).
- If needed, Node.js docs on process signals and `childProcess.kill()`.
- (No VSCode-specific reference here, as this is Node internals.)

## Phase 6: Connect to MCP Servers and Retrieve Tools

**Goal**: Establish communication with each running MCP server and retrieve the list of tools it provides. Use the Model Context Protocol (MCP) client to list tools dynamically. This will prepare the data needed to register tools with VS Code’s Language Model API.

**Key Implementation Details**:

- **MCP Client SDK**: Leverage the official **Model Context Protocol TypeScript SDK** (`@modelcontextprotocol/sdk`) for connecting to servers. This saves us from implementing the MCP protocol manually. Import the client classes, e.g.:
    
    ```ts
    import { Client as MCPClient } from "@modelcontextprotocol/sdk/client";
    import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
    ```
    
- **Connect on Start**: When a server process is spawned (Phase 5), create an MCP client for it. Use `new StdioClientTransport({ command: ..., args: ... })` **OR** attach to the already spawned process. The SDK’s `StdioClientTransport` can actually spawn the process for you given a command, but since we already spawned it, we might need an alternative approach to attach to an existing process’s stdio. If the SDK allows passing existing streams or process, use that; otherwise, consider simply using SDK to spawn to simplify (you could replace our manual spawn with the SDK’s transport). For clarity, using SDK’s spawn is straightforward:
    
    ```ts
    const transport = new StdioClientTransport({ command: "node", args: ["server.js"] });
    const client = new MCPClient({ name: "vscode-extension", version: "1.0" }, { capabilities: { tools: {} } });
    await client.connect(transport);
    ```
    
    This would start `server.js` via the SDK and connect ([@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk#:~:text=The%20SDK%20provides%20a%20high,client%20interface)). In our case, to manage processes ourselves, we may instead do:
    
    ```ts
    const transport = new StdioClientTransport(); 
    transport.connect(childProcess.stdin, childProcess.stdout);
    const client = new MCPClient(...);
    await client.attach(transport);
    ```
    
    (Pseudo-code – check SDK docs if attach is supported). If the SDK doesn’t support attaching easily, consider using it to spawn directly for simplicity.
- **List Tools**: Once connected, call `await client.listTools()`. The SDK should provide a method that returns an array of tool definitions (each with a name, description, input schema, etc.). For example, in the Python SDK, `session.list_tools()` returns objects with `name`, `description`, `inputSchema` ([For Client Developers - Model Context Protocol](https://modelcontextprotocol.io/quickstart/client#:~:text=,name%20for%20tool%20in%20tools)) ([For Client Developers - Model Context Protocol](https://modelcontextprotocol.io/quickstart/client#:~:text=response%20%3D%20await%20self,tools)). In TypeScript SDK, it likely returns a similar list. Save this list of tools along with the server info.
- **Dynamic Updates**: If the MCP server is long-lived, it might notify of tool changes. The SDK might emit events or have a subscription for tool list changes (MCP spec has `notifications/tools/list_changed` ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=1,this%20should%20be%20done%20carefully))). You can register an event on the `client` if available (e.g., `client.on('toolsChanged', ...)`) to handle tools added/removed at runtime. For now, a simpler approach: re-fetch tools list whenever the server (re)connects, and perhaps periodically if needed.
- **UI Indication**: After retrieving the tools, update the UI panel to show that the server is connected and how many tools found. For example, each server entry in the UI could display a badge or text like “(3 tools)” or list the tool names under it (collapsible). Send a message to the webview with the tool list or at least the count. E.g., `postMessage({ type: 'toolsList', id: serverId, tools: [...] })`. The React state can store the tools per server and render accordingly (perhaps expandable details).
- **Error Handling**: If connecting or listing tools fails (e.g., server not responding on stdio), catch the error. Possibly the server may not support the MCP protocol properly or exited. In such cases, notify the user (we’ll do notifications in Phase 8, but at least log now) and mark the server as “error” state in UI.

**Expected Output**:  
When a server is toggled on, the extension connects to it via MCP and fetches its available tools. The UI updates to show that the server is running and list how many tools (for example, “Server X – 5 tools available”). This confirms that the extension can communicate with the MCP server process. At this point, the extension knows about each tool’s name, description, and input schema. However, the tools are not yet integrated with Copilot – that comes next.

**References**:

- **MCP Protocol dynamic tool discovery**: _“Clients can list available tools at any time; Servers can notify clients when tools change...”_ ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=MCP%20supports%20dynamic%20tool%20discovery%3A)). This explains why we fetch tool lists and possibly handle updates.
- **TypeScript MCP SDK usage**: Example from the SDK README – spawning a server and connecting a client ([@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk#:~:text=The%20SDK%20provides%20a%20high,client%20interface)), and calling tools ([@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk#:~:text=%2F%2F%20Read%20a%20resource%20const,file%3A%2F%2F%2Fexample.txt)). (Our use differs slightly as we manage processes, but the methods (`listTools`, `callTool`) are the same.)
- Python example (for conceptual reference): listing tools after connecting ([For Client Developers - Model Context Protocol](https://modelcontextprotocol.io/quickstart/client#:~:text=,name%20for%20tool%20in%20tools)) ([For Client Developers - Model Context Protocol](https://modelcontextprotocol.io/quickstart/client#:~:text=response%20%3D%20await%20self,tools)).
- Ensure the **MCP server** you test with actually provides tools (for testing, you might use a simple MCP server script that exposes a couple of dummy tools).

## Phase 7: Register/Unregister Tools with VSCode’s Language Model API

**Goal**: Expose the tools from each MCP server to VS Code’s language model API so that GitHub Copilot (or other AI extensions) can utilize them. This involves creating `LanguageModelTool` objects for each tool and registering them via `vscode.lm.registerTool`. Also handle deregistration when servers stop or tools change.

**Key Implementation Details**:

- **Implement LanguageModelTool**: For each tool retrieved from an MCP server, implement the VS Code `LanguageModelTool` interface. You can create a class (e.g., `McpProxyTool`) that implements `vscode.LanguageModelTool`. Its important methods:
    - `invoke(options: vscode.LanguageModelToolInvocationOptions<ArgsType>, token: CancellationToken)`: this will be called when the tool is invoked by the AI. Inside, use the corresponding MCP client’s `callTool` to execute the tool. For example, if the tool name is "searchDocs", you’d call `client.callTool({ name: "searchDocs", arguments: options.input })` and get a result. The result should be formatted as `vscode.LanguageModelToolResult`. Typically, you can take the MCP result (which likely has a content array of {type: "text", text: "..."} and possibly `isError`) and convert it. For instance, combine all text parts into a single string or `LanguageModelMessage` array. If `isError` is true, you might throw an error or return a result with an error indication.
    - `get title` or `displayName`: If needed, implement any getters for display properties. However, since we registered the tool with a name that was in package.json normally, we might skip that by providing the name in registration directly. (The `registerTool` API requires the tool’s name as contributed in package.json, but since these tools are dynamic, we did not list them in package.json. VS Code might still allow dynamic names, especially for proposed API. We will use a unique name per tool, perhaps prefixing with the server id.)
    - Optionally, implement `prepareInvocation` to show a confirmation or preparation message. For now, this can be a simple confirmation prompt. For example, you can provide a `confirmationMessage` like “Allow tool X to run?” or use the tool’s description. If you want to skip confirmation, `prepareInvocation` can just return an `invocationMessage` (like a status text “Running tool X…”).
- **Register Tools**: Once the `LanguageModelTool` instance is ready, call `vscode.lm.registerTool` with a unique tool identifier and the instance. Normally, the first argument should match a name declared in `package.json` under `contributes.languageModelTools`. However, since we cannot predefine dynamic tools, you might register them with an arbitrary unique name. Ideally, namespace the tool by server, e.g., `"mcp-${serverId}-${toolName}"`. The second argument is the tool instance. Push the returned `Disposable` into an array for later cleanup. Example:
    
    ```ts
    const disposable = vscode.lm.registerTool(uniqueName, toolInstance);
    context.subscriptions.push(disposable);
    ```
    
    This makes the tool available globally. (Once registered, **any LLM** extension can discover it. For example, Copilot Chat might list it as `#uniqueName` tool.) ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=2,registerTool))
- **Avoid Duplicate Registrations**: Keep track of which tools are currently registered. If a server restarts or tool list refreshes, avoid registering the same tool twice. If re-registering, dispose the old registration first. Using the unique name scheme helps (VS Code might also warn if name conflicts).
- **Unregister on Stop**: When a server is toggled off or removed, iterate through its tools and dispose their registrations. Also destroy the MCP client for that server to free resources. This ensures tools from offline servers aren’t callable. (You might also decide to keep them registered but return errors on invoke if server offline – but disposing is cleaner.)
- **Tool Invocation Handling**: In the `invoke` implementation, handle exceptions from the MCP call gracefully. For example, if `client.callTool` throws (maybe the server died), catch it and either return an error result or throw. According to VS Code’s LanguageModelTool API, if an error is thrown, it might propagate to the user. Alternatively, you can return a `LanguageModelToolResult` with content that indicates the error (the MCP spec suggests including error message in result content with `isError: true` ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=Error%20handling)) ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=1.%20Set%20,array)), but the VS Code API might not have direct `isError` flag – you can just include the error text).
- **Testing with Copilot**: Once registered, test in the Copilot Chat (or VS Code’s built-in Chat view if available). The tools should be listed or at least usable via the `#toolName` syntax. For example, if a tool is named “mcp-1-searchDocs”, you might type `#searchDocs{"query": "something"}` in Copilot chat and it should trigger the tool. Ensure the extension is running under VS Code Insiders or a version that supports the tool API, as this is new.
- **Security**: As a note, tools can run arbitrary commands (since MCP servers do). Make sure to only register tools for trusted workspaces or with user consent if needed. This might be beyond scope, but keep it in mind.

**Expected Output**:  
All tools from the configured MCP servers are exposed to the VS Code language model ecosystem. In practice, if GitHub Copilot Chat is open, it will become aware of these tools. The user (or the AI) can invoke the tools to perform actions. For instance, an MCP server tool "translateText" when invoked by Copilot will cause our extension’s `invoke` to call the server and return the result, which the AI can then use in its response. If a server is turned off, its tools no longer appear or function. We have effectively bridged the external MCP tools into VS Code’s AI features.

**References**:

- VS Code **LanguageModelTool API**: _“If you want to publish the tool for use by other extensions, you must register the tool with `vscode.lm.registerTool`.”_ ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=2,registerTool)). Also example of registering: `vscode.lm.registerTool('chat-tools-sample_tabCount', new TabCountTool()) ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=export%20function%20registerChatTools%28context%3A%20vscode.ExtensionContext%29%20,sample_tabCount%27%2C%20new%20TabCountTool%28%29%29%3B))`.
- **LanguageModelTool interface** example implementation (TabCountTool in VS Code samples) – shows `prepareInvocation` and `invoke` usage ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=,message%20for%20the%20tool%20invocation)) ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=,parameter)).
- MCP **Tool error handling**: MCP spec suggests returning errors in result content rather than exceptions ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=Error%20handling)) ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=1.%20Set%20,array)). We can align with that when constructing `LanguageModelToolResult`.
- **Copilot integration**: Once tools are registered, they are available to AI extensions. (For instance, the VS Code docs note that published tools are available to all extensions ([LanguageModelTool API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/tools#:~:text=When%20calling%20tools%2C%20you%20can,extension%20as%20a%20private%20tool)).)

## Phase 8: Robust Error Handling and User Feedback

**Goal**: Make the extension user-friendly and resilient. Provide clear notifications and status updates for errors or important events (server start/stop, connection failures, tool invocation issues). Also ensure any configuration changes trigger appropriate actions (reconnections or refreshes).

**Key Implementation Details**:

- **User Notifications**: Utilize VS Code’s notification API for critical issues. For example, if a server fails to start (process exits with error), use `vscode.window.showErrorMessage(`🚫 Failed to start MCP server X: `);` to alert the user. Similarly, if a tool invocation from the AI fails due to a server issue, consider a notification or status bar message. Use `showInformationMessage` for non-critical info (like “✅ Connected to MCP server X”) and `showWarningMessage` or `showErrorMessage` for problem ([Common Capabilities | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#:~:text=API%20code,showWarningMessage%20%C2%B7%20window))】. Keep messages concise and perhaps include an action (e.g., “View Logs” that opens an output channel with details).
- **Output Channel Logs**: Create a dedicated output channel (e.g., `vscode.window.createOutputChannel("MCP Extension")`) to log server stdout/stderr, connection events, and tool calls. This is useful for users to troubleshoot tool output or errors. Append messages like “Starting server …”, “Server output: ...”, “Tool called with args: ...”. Only show this output channel to the user on errors or when they explicitly open it (don’t spam the user unprompted).
- **Status Indicators in UI**: Enhance the React UI to show statuses: for each server, display if it’s running, stopped, or error. You might color-code the name (green for running, red for error) or add an icon. Maintain this status in the React state from messages received. For instance, when a server process exits unexpectedly, send a message `{ type: 'serverStatus', id: X, status: 'error', message: 'Exited with code' }` – the UI can then show an error icon next to that server. Perhaps also disable its toggle until user toggles it again (which will clear error and try restarting).
- **Graceful Shutdown**: Handle extension deactivation: in `extension.deactivate`, ensure all child processes are killed and all tool registrations are disposed. This prevents orphan processes if VS Code is closed.
- **Watch Config Changes**: (From Phase 4) We already listen for `onDidChangeConfiguration`. Make sure that if the user edits the config to disable a server, we respond by stopping it, or if a new server is added via settings, we start it if `enabled=true`. Because our source of truth is the settings now, such changes should reflect. We might incorporate a small logic: after updating settings via our UI, the `onDidChangeConfiguration` will also fire – guard against double-handling (e.g., ignore events triggered by our own updates if not needed).
- **Edge Cases**: If a user removes a server that is currently running, ensure the process is stopped and tools unregistered. If the user toggles a server off that is in the middle of a tool invocation, handle that (maybe allow the current invocation to finish, or cancel if possible via `CancellationToken`). If a server provides a large number of tools, performance-test registering all (maybe limit or lazy-register if needed). Also, if two servers have tools with the same name, ensure unique registration names to avoid collisions.
- **Testing & Debugging**: Test the whole flow: adding servers, starting them, calling tools via Copilot, stopping servers, removing, and re-adding. Make sure the UI and the backend remain in sync and no processes or registrations leak. Test error scenarios: point a server command to a non-existent script to see error handling, kill a running server process externally to see if extension detects it.

**Expected Output**:  
A polished extension that not only functions but also communicates with the user. Users can see and manage their MCP servers easily. If something goes wrong (like a server crashes or a tool throws an error), they receive a clear notification (and can check the output log for details). The UI always reflects the current state (config and runtime) of each server. Configuration edits are smoothly handled whether done through the UI or settings. Overall, the extension feels robust and integrated into VS Code’s UX (using notifications and status indications appropriately).

**References**:

- **VS Code Notifications API**: *“VS Code offers three APIs for displaying notification messages... showInformationMessage · showWarningMessage · showErrorMessage” ([Common Capabilities | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#:~:text=API%20code,showWarningMessage%20%C2%B7%20window))】. Use these for user-facing alerts.
- **Best practices for UX**: Do not overwhelm with messages; use status bar or output channel for verbose logs, and modal pop-ups only for important issues.
- **Dynamic tool updates**: Reminder of MCP dynamic tools notificatio ([Tools - Model Context Protocol](https://modelcontextprotocol.io/docs/concepts/tools#:~:text=1,this%20should%20be%20done%20carefully))】 – if implementing that, ensure to register/unregister tools on the fly, with similar user feedback if needed (this can be an advanced enhancement).
- **Resource management**: Cleaning up processes and disposables to avoid leaks (general Node.js and VS Code extension practice).

## Testing MCP Tools in Copilot Chat

- After starting your MCP server and registering tools, open a Copilot Chat panel.
- Type a prompt like, "List available tools" or "Use the tool named 'mcp-YourTool'" to see if it's recognized.
- Confirm the correct tool name is visible (e.g., "mcp-MyExampleTool").

---

With these structured prompts, a coding agent (or developer) can implement the VSCode extension step by step. Each phase builds on the previous, ensuring the final product meets all requirements: multi-server management, React-based UI, dynamic tool registration for Copilot, and robust error handling.