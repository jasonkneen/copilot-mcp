import * as vscode from 'vscode';
import { Logger } from './Logger';

/**
 * Centralized error handling utility for the extension
 */
export class ErrorHandler {
    /**
     * Handle an error with consistent logging and user notification
     * @param context The context where the error occurred
     * @param error The error object
     * @param outputChannel Optional output channel to log to
     * @param showToUser Whether to show the error to the user via notification
     */
    public static handleError(
        context: string,
        error: unknown,
        outputChannel?: vscode.OutputChannel,
        showToUser: boolean = true
    ): void {
        try {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log to console
            console.error(`[${context}] Error: ${errorMessage}`);

            // Log to output channel if provided
            if (outputChannel) {
                outputChannel.appendLine(`Error in ${context}: ${errorMessage}`);
                if (error instanceof Error && error.stack) {
                    outputChannel.appendLine(error.stack);
                }
            }

            // Try to use logger if available
            try {
                const logger = Logger.getInstance();
                logger.error(`[${context}] ${errorMessage}`, error, showToUser);
            } catch (loggerError) {
                // Logger not initialized, fall back to basic notification
                if (showToUser) {
                    vscode.window.showErrorMessage(`${context}: ${errorMessage}`);
                }
            }
        } catch (handlerError) {
            // Last resort if error handling itself fails
            console.error('Error in error handler:', handlerError);
            if (showToUser) {
                vscode.window.showErrorMessage(`Error handling failed: ${String(handlerError)}`);
            }
        }
    }

    /**
     * Check if an error is related to an unsupported MCP method
     * @param error The error to check
     * @returns True if the error indicates a method not found/supported
     */
    public static isMethodNotSupportedError(error: unknown): boolean {
        return error instanceof Error &&
            (error.message.includes('Method not found') ||
                error.message.includes('-32601'));
    }
} 