import * as vscode from 'vscode';

/**
 * Logging levels
 */
export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3
}

/**
 * Logger for the extension
 */
export class Logger {
    private static _instance: Logger | undefined;
    private _outputChannel: vscode.OutputChannel;
    private _level: LogLevel;

    /**
     * Create a new logger
     * @param context The extension context
     * @param name The logger name
     * @param level The minimum log level
     */
    private constructor(
        private readonly _context: vscode.ExtensionContext,
        name: string = 'MCP Server Manager',
        level: LogLevel = LogLevel.Info
    ) {
        this._outputChannel = vscode.window.createOutputChannel(name);
        this._level = level;
        
        // Add to context for cleanup
        this._context.subscriptions.push(this._outputChannel);
    }

    /**
     * Initialize the logger
     * @param context The extension context
     * @param name The logger name
     * @param level The minimum log level
     */
    public static initialize(
        context: vscode.ExtensionContext,
        name?: string,
        level?: LogLevel
    ): Logger {
        if (Logger._instance) {
            return Logger._instance;
        }
        
        Logger._instance = new Logger(context, name, level);
        return Logger._instance;
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): Logger {
        if (!Logger._instance) {
            throw new Error('Logger not initialized');
        }
        return Logger._instance;
    }

    /**
     * Set the minimum log level
     */
    public setLevel(level: LogLevel): void {
        this._level = level;
    }

    /**
     * Log a debug message
     */
    public debug(message: string): void {
        this._log(LogLevel.Debug, message);
    }

    /**
     * Log an info message
     */
    public log(message: string): void {
        this._log(LogLevel.Info, message);
    }

    /**
     * Log a warning message
     */
    public warn(message: string): void {
        this._log(LogLevel.Warn, message);
    }

    /**
     * Log an error message
     */
    public error(message: string): void {
        this._log(LogLevel.Error, message);
    }

    /**
     * Log a message with a specific level
     */
    private _log(level: LogLevel, message: string): void {
        if (level < this._level) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const prefix = this._getLevelPrefix(level);
        const formatted = `[${timestamp}] ${prefix} ${message}`;
        
        this._outputChannel.appendLine(formatted);
    }

    /**
     * Get a prefix for a log level
     */
    private _getLevelPrefix(level: LogLevel): string {
        switch (level) {
            case LogLevel.Debug:
                return '[DEBUG]';
            case LogLevel.Info:
                return '[INFO ]';
            case LogLevel.Warn:
                return '[WARN ]';
            case LogLevel.Error:
                return '[ERROR]';
            default:
                return '';
        }
    }

    /**
     * Show the log output channel
     */
    public show(): void {
        this._outputChannel.show();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this._outputChannel.dispose();
    }
}