import * as vscode from 'vscode';

/**
 * Centralized logging utility for the extension
 */
export class Logger {
    private readonly _outputChannel: vscode.OutputChannel;
    private static _instance: Logger;

    /**
     * Creates a new Logger instance
     * @param context The extension context
     * @param channelName The name of the output channel
     */
    constructor(
        private readonly context: vscode.ExtensionContext,
        channelName: string = 'MCP Extension'
    ) {
        this._outputChannel = vscode.window.createOutputChannel(channelName);
        this.context.subscriptions.push(this._outputChannel);
        Logger._instance = this;
    }

    /**
     * Gets the singleton instance of the logger
     */
    public static getInstance(): Logger {
        if (!Logger._instance) {
            throw new Error('Logger has not been initialized');
        }
        return Logger._instance;
    }

    /**
     * Log an informational message
     * @param message The message to log
     */
    public log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] INFO: ${message}`);
        console.log(`[INFO] ${message}`);
    }

    /**
     * Log a warning message
     * @param message The message to log
     */
    public warn(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] WARN: ${message}`);
        console.warn(`[WARN] ${message}`);
    }

    /**
     * Log an error message
     * @param message The message to log
     * @param error The error object
     * @param showToUser Whether to show the error to the user via notification
     */
    public error(message: string, error?: unknown, showToUser: boolean = false): void {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const logMessage = `[${timestamp}] ERROR: ${message}${error ? `: ${errorMessage}` : ''}`;

        this._outputChannel.appendLine(logMessage);
        console.error(`[ERROR] ${message}`, error);

        if (showToUser) {
            vscode.window.showErrorMessage(`${message}${error ? `: ${errorMessage}` : ''}`);
        }
    }

    /**
     * Show the output channel
     */
    public show(): void {
        this._outputChannel.show();
    }

    /**
     * Dispose the logger resources
     */
    public dispose(): void {
        this._outputChannel.dispose();
    }
} 