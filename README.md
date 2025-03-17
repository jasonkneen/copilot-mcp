# mcpsx.run

VSCode extension that acts as a Model Context Protocol (MCP) client, enabling integration between MCP servers and GitHub Copilot Chat.

## Features

- Connect to MCP servers using either process-based or SSE-based transports
- View and manage MCP servers in a dedicated view
- Use MCP tools in GitHub Copilot Chat
- Expose MCP tools to other clients through an SSE endpoint
- View server instances in a seperate panel

## Getting Started

1. Install the extension from the VSCode Marketplace
2. Open the mcpsx.run view from the activity bar
3. Add MCP servers using the "+" button
4. Enable/disable servers using the toggle switch
5. Use MCP tools in GitHub Copilot Chat

## Using MCP Tools in GitHub Copilot Chat

Once you have connected to an MCP server, the tools provided by that server will be available in GitHub Copilot Chat. You can use these tools by typing "@mcps" followed by the tool name.

## Exposing MCP Tools to Other Clients

mcpsx.run now includes an MCP SSE server that exposes all the tools from connected MCP clients to other clients. This allows you to use the tools from your MCP servers in other applications that support the Model Context Protocol.

To use this feature:

1. The SSE server is automatically started when the extension is activated
2. The server runs on port 3000 by default
3. You can get the server URL by running the "Copy MCP Server Socket Path" command from the command palette
4. Connect to the MCP server from other clients using the URL

The URL for connecting to the server is: `http://localhost:3000`

### Available Endpoints

- `GET /`: Health check endpoint that returns server status
- `GET /sse`: SSE connection endpoint for establishing a connection
- `POST /messages`: Message endpoint for sending messages to the server

### Connecting to the Server

To connect to the MCP server from another client, you need to:

1. Use the URL `http://localhost:3000` to establish an SSE connection
2. Send messages to `http://localhost:3000/messages`

The server implements CORS headers to allow cross-origin requests.

## Adding MCP Servers

You can add MCP servers in two ways:

1. Using the "+" button in the mcpsx.run view
2. Editing the extension settings directly

### Adding Servers Through Settings

You can add servers by editing the `mcpsx.servers` setting in your VSCode settings. The setting is an array of server configurations, each with the following properties:

```json
{
  "id": "unique-id",
  "name": "Server Name",
  "command": "command to start the server",
  "enabled": true,
  "type": "process" // or "sse"
}
```

For SSE servers, you also need to provide a `url` property:

```json
{
  "id": "unique-id",
  "name": "Server Name",
  "url": "http://localhost:8000",
  "enabled": true,
  "type": "sse"
}
```

## Commands

The extension provides the following commands:

- `mcpsx-run.studio.openServerManager`: Open the mcpsx.run view
- `mcpsx-run.studio.copyMcpServerSocketPath`: Copy the MCP server URL to the clipboard
- `mcpsx-run.studio.getMcpServerSocketPath`: Get the MCP server socket path (for use in other extensions)

## Requirements

- VSCode 1.97.0 or higher
- GitHub Copilot Chat extension

## Extension Settings

This extension contributes the following settings:

- `mcpsx.servers`: List of configured MCP servers

## Known Issues

- None

## Release Notes

### 1.0.15

- Added MCP SSE server to expose MCP tools to other clients
- Added commands to get and copy the MCP server URL
### 1.0.0

- Initial release
