# Changelog

All notable changes to the MCP Server Extension will be documented in this file.

## [Unreleased]

### Refactoring

- Created initial refactoring plan in `refactoring-plan.md`
- Set up folder structure for better separation of concerns
- Defined core interfaces for the refactored components
- Created utility classes:
  - Logger: Centralized logging with better formatting and error handling
  - ErrorHandler: Consistent error handling across the extension
  - EventBus: Inter-component communication
- Implemented MCPClientWrapper with improved error handling and automatic reconnection
- Implemented ServerManager to handle the complete server lifecycle
  - Server configuration handling
  - Process management
  - MCP client integration
  - Event dispatching
- Implemented ToolManager for VS Code tool integration
  - Tool registration with proper error handling
  - Event-based tool updates
  - Improved tool result formatting
- Implemented ResourceManager for MCP resources
  - Resource tracking across servers
  - Command registration for resource viewing
  - Enhanced resource content display
- Created ChatHandler for chat integration
  - Simplified chat request handling
  - Support for special commands
  - Enhanced resource listing
- Fixed "Method not found" errors for MCP servers that don't support all methods

- Initial release