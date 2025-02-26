#!/bin/bash

# Install Git Hooks
# This script copies the hooks from the scripts/git-hooks directory to the .git/hooks directory

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the git hooks directory
HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

# Create the hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Install pre-push hook
echo "Installing pre-push hook..."
cp "$SCRIPT_DIR/pre-push" "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/pre-push"

echo "Git hooks installed successfully!" 