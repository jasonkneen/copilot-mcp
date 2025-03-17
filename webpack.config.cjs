//@ts-check

'use strict';

const path = require('path');
const fs = require('fs');
const TerserPlugin = require('terser-webpack-plugin');

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

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'development', // Set to development mode to disable optimizations

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.cjs',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Explicitly alias the problematic imports to their actual paths
      '@modelcontextprotocol/sdk/client/index': clientPath,
      '@modelcontextprotocol/sdk/types': typesPath
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
  optimization: {
    minimize: false, // Disable minification completely
  },
};

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
      // Explicitly alias the problematic imports to their actual paths
      '@modelcontextprotocol/sdk/client/index': clientPath,
      '@modelcontextprotocol/sdk/types': typesPath
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
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
    minimize: false, // Disable minification completely
  }
};

// Configuration for the instances panel webview
const instancesWebviewConfig = {
  target: 'web',
  mode: 'development',
  entry: './src/webview/instancesWebview.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'instancesWebview.js',
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
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
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
    minimize: false, // Disable minification completely
  }
};

module.exports = [ extensionConfig, webviewConfig, instancesWebviewConfig ];