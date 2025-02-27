# Copilot MCP Client for VSCode



<div style="display: flex; justify-content: center; gap: 20px; margin: 20px 0;">
  <img width="1461" alt="image" src="https://github.com/user-attachments/assets/5ce9ec67-6f8a-4564-a27d-33e21026a3e3" />
</div>
<div align="center">
<img src="logo.png" alt="Copilot MCP Logo" width="200" />

![Version](https://img.shields.io/badge/version-0.0.13-blue.svg?cacheSeconds=2592000)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg?logo=visual-studio-code)](https://code.visualstudio.com/api/references/extension-guidelines)
[![MCP Client](https://img.shields.io/badge/MCP-Client-green.svg)](https://modelcontextprotocol.io/clients)

</div>

> A powerful VSCode extension that acts as a Model Context Protocol (MCP) client, enabling seamless integration between MCP tool servers and GitHub Copilot Chat. Join the growing ecosystem of interoperable AI applications with flexible integration options.

## ✨ Features

- 🔧 **MCP Server Management**: Connect and manage multiple MCP servers through an intuitive UI
- 🚀 **Copilot Integration**: Expose MCP tools directly to GitHub Copilot Chat participants
- 🎯 **Tool Discovery**: Automatically discover and surface available tools from connected MCP servers
- ⚡ **Server Health Monitoring**: Real-time monitoring of MCP server status and connections
- 🔄 **Automatic Connection Management**: Seamless handling of MCP server connections and reconnections
- 🛠️ **Tool Invocation Support**: Full support for MCP tool invocation through Copilot Chat
- 🔄 **Multiple Server Types**: Support for both process-based and SSE (Server-Sent Events) servers
- 🛡️ **Configuration Migration**: Automatic migration of server configurations to the latest format
- 🧩 **Server Configuration Command**: Manual migration command for updating older configurations

## 🎯 MCP Feature Support

| Feature | Support |
|---------|----------|
| Tools | ✅ Full support |
| Resources | ✅* Text resource support |
| Prompts | ✅* Full support (coming soon) |
| Sampling | ⏳ Planned |
| Roots | ⏳ Planned |

## 📦 Installation

1. Install the extension from the VSCode Marketplace
2. Configure your MCP servers through the extension settings
3. Start using GitHub Copilot Chat with your MCP tools!

## 🛠️ Configuration

You can configure your MCP servers in the UI or in VSCode settings.

In the UI, look for the "MCP Servers" button in the activity bar.

To configure your MCP servers in VSCode settings:

```json
{
  "mcpManager.servers": [
    {
      "id": "process-server",
      "name": "Process MCP Server",
      "type": "process",
      "command": "start-server-command",
      "enabled": true
    },
    {
      "id": "sse-server",
      "name": "SSE MCP Server",
      "type": "sse",
      "url": "https://your-sse-server.com/events",
      "authToken": "your-optional-auth-token",
      "enabled": true
    }
  ]
}
```

### Server Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier for the server |
| `name` | string | Display name for the server |
| `type` | string | Server type: "process" or "sse" |
| `command` | string | Command to start the server (for process servers) |
| `url` | string | URL for SSE connection (for SSE servers) |
| `authToken` | string | Authentication token (optional, for SSE servers) |
| `enabled` | boolean | Whether the server is enabled |
| `env` | object | Environment variables for process servers (key-value pairs) |

## 🚀 Usage

1. Open the MCP Servers view from the VSCode activity bar
2. Add and configure your MCP servers
3. Enable/disable servers as needed
4. Use GitHub Copilot Chat with your connected MCP tools using the `@mcp` participant
5. View server status and tool availability in real-time
6. If upgrading from an older version, you can use the command "MCP: Migrate Server Configurations to Latest Format" to update your server configurations

## 🔗 Requirements

- VSCode 
- GitHub Copilot Chat extension
- Compatible MCP servers (see [Example Servers](https://modelcontextprotocol.io/servers))

## 🌟 Benefits

- Enable Copilot to use custom context and tools through MCP
- Join the growing ecosystem of interoperable AI applications
- Support local-first AI workflows
- Flexible integration options for your development workflow

## 👥 Contributing

Contributions, issues and feature requests are welcome!
Feel free to check the [issues page](https://github.com/yourusername/copilot-mcp/issues).

## ✍️ Author

**Vikash Loomba**

* Website: https://automatalabs.io
* Github: [@vikashloomba](https://github.com/vikashloomba)

## 📝 License

Copyright © 2024 [Vikash Loomba](https://automatalabs.io).

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

_Part of the [MCP Client Ecosystem](https://modelcontextprotocol.io/clients) - Enabling interoperable AI tools for developers_ ⭐️
