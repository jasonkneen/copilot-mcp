# Changelog

All notable changes to the MCP Server Extension will be documented in this file.

## [Unreleased]

### New Features

- Added support for SSE (Server-Sent Events) server type
- Added automatic server configuration migration for backwards compatibility
- Added `MCP: Migrate Server Configurations to Latest Format` command to manually update older server configurations
- Enhanced UI to support different server types:
  - Added server type selection in add/edit server interfaces
  - Added type-specific form fields (command for Process, URL/auth for SSE)
  - Added server type badges for easy identification
- Added new UI components from shadcn/ui library:
  - Badge component for displaying server types
  - Separator component for UI organization
  - Dropdown menu component for additional actions

### UI Improvements

- Redesigned ServerCard components for a more compact, space-efficient display:
  - Added collapsible sections for server details, tools, and environment variables
  - Enhanced visual hierarchy with better use of color and typography
  - Improved theme compatibility using VSCode-native variables
  - Added subtle animations and transitions for a more polished feel
  - Improved readability of server information with better layout
  - Added hover states and visual feedback for interactive elements
  - Implemented VSCode-style form elements in edit mode
  - Enhanced badges to show server type and tool count in compact view
- Fixed UI issues in ServerCard component:
  - Corrected toggle switch styling to match VSCode's native appearance
  - Fixed icon alignment and sizing for more consistent spacing
  - Improved badge alignment and height consistency
  - Adjusted vertical spacing for better readability
  - Enhanced component to work better across different VSCode themes
  - Fixed toggle switch functionality to prevent triggering card expansion
  - Fixed disappearing icons in the collapsible sections for tools and environment variables
  - Improved event handling to prevent event propagation between UI elements

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
- Created ServerViewProvider for the UI
  - React-based server management interface
  - Event-driven UI updates
  - Simplified communication with extension
- Refactored extension.ts to use new architecture
  - Streamlined activation flow
  - Clear component initialization
  - Proper error handling
  - Improved command registration
- Fixed "Method not found" errors for MCP servers that don't support all methods

- Initial release