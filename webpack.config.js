//@ts-check

'use strict';

const path = require('path');
const fs = require('fs');

// Check if the CJS files exist
const sdkPath = path.resolve(__dirname, 'node_modules/@modelcontextprotocol/sdk');
const cjsClientPath = path.resolve(sdkPath, 'dist/cjs/client/index.js');
const cjsTypesPath = path.resolve(sdkPath, 'dist/cjs/types.js');

// Get proper paths depending on what exists
const clientPath = fs.existsSync(cjsClientPath) 
  ? cjsClientPath 
  : path.resolve(sdkPath, 'dist/esm/client/index.js');

const typesPath = fs.existsSync(cjsTypesPath)
  ? cjsTypesPath
  : path.resolve(sdkPath, 'dist/esm/types.js');

// Path to toolsParticipant directory
const toolsParticipantPath = path.resolve(__dirname, 'src/chat/toolsParticipant');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    // Externalize the following toolsParticipant files to prevent compilation errors
    './chat/toolsParticipant/toolParticipant': 'commonjs ./chat/toolsParticipant/toolParticipant',
    './chat/toolsParticipant/tools': 'commonjs ./chat/toolsParticipant/tools',
    './chat/toolsParticipant/toolsPrompt': 'commonjs ./chat/toolsParticipant/toolsPrompt',
    '@vscode/prompt-tsx': 'commonjs @vscode/prompt-tsx'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@modelcontextprotocol/sdk/client/index': clientPath,
      '@modelcontextprotocol/sdk/types': typesPath
    },
    modules: [
      'node_modules'
    ]
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: [/node_modules/, toolsParticipantPath],
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\keytar.node$/,
        use: {
          loader: "file-loader"
        }
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'development',
  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webview.js',
    library: {
      type: 'module'
    }
  },
  experiments: {
    outputModule: true
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@modelcontextprotocol/sdk/client/index': clientPath,
      '@modelcontextprotocol/sdk/types': typesPath
    },
    modules: [
      'node_modules'
    ]
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: [/node_modules/, toolsParticipantPath],
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'esnext'
              }
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  performance: {
    hints: false
  },
  optimization: {
    minimize: false
  }
};

/** @type WebpackConfig */
const toolsParticipantConfig = {
  target: 'node',
  mode: 'none',
  entry: {
    'toolParticipant': './src/chat/toolsParticipant/toolParticipant.ts',
    'tools': './src/chat/toolsParticipant/tools.ts',
    'toolsPrompt': './src/chat/toolsParticipant/toolsPrompt.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist/chat/toolsParticipant'),
    filename: '[name].js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    '@vscode/prompt-tsx': 'commonjs @vscode/prompt-tsx'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@vscode/prompt-tsx': path.resolve(toolsParticipantPath, 'node_modules/@vscode/prompt-tsx'),
      '@vscode/prompt-tsx/dist/base/promptElements': path.resolve(toolsParticipantPath, 'node_modules/@vscode/prompt-tsx/dist/base/promptElements')
    },
    modules: [
      path.resolve(toolsParticipantPath, 'node_modules'),
      'node_modules'
    ]
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(toolsParticipantPath, 'tsconfig.json'),
              transpileOnly: true,
              happyPackMode: true
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map'
};

module.exports = [extensionConfig, webviewConfig, toolsParticipantConfig];