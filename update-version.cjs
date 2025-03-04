#!/usr/bin/env node

/**
 * A script to automatically update version numbers across the project.
 * Run this before packaging/publishing to ensure version consistency.
 */

const fs = require('fs');
const path = require('path');

// Check if this is a production build
const isProduction = process.argv.includes('--production');

// Function to increment version - supports semver
function incrementVersion(version, type = 'patch') {
  const [major, minor, patch] = version.split('.').map(Number);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

// Read the current version from package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Only update version for production builds
if (isProduction) {
  // Get version increment type from command line argument
  // Skip the --production flag if present
  const incrementType = process.argv.find(arg => arg !== '--production' && !arg.startsWith('-')) || 'patch';
  const newVersion = incrementVersion(currentVersion, incrementType);

  console.log(`Production build detected. Updating version from ${currentVersion} to ${newVersion}...`);

  // Update package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('✅ Updated package.json');

  // Update version in README.md
  const readmePath = path.join(__dirname, 'README.md');
  let readmeContent = fs.readFileSync(readmePath, 'utf8');
  readmeContent = readmeContent.replace(
    /!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-[0-9.]+/g,
    `![Version](https://img.shields.io/badge/version-${newVersion}`
  );
  fs.writeFileSync(readmePath, readmeContent);
  console.log('✅ Updated README.md');

  console.log(`Version successfully updated to ${newVersion}`);
} else {
  console.log(`Non-production build detected. Keeping version at ${currentVersion}.`);
  console.log(`To update version, run with --production flag: node update-version.cjs --production [patch|minor|major]`);
}