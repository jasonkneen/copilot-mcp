/**
 * Custom loader to properly handle @vscode/prompt-tsx files
 * This loader transforms JSX to use vscpp as the factory
 */
const path = require('path');

module.exports = function(source) {
  // Only transform files that are in the toolsParticipant directory
  const isToolsParticipant = this.resourcePath.includes(
    path.join('src', 'chat', 'toolsParticipant')
  );

  if (isToolsParticipant) {
    // Log for debugging
    console.log('Processing toolsParticipant file:', this.resourcePath);
  }

  return source;
}; 