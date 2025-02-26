import * as vscode from 'vscode';
import { ServerEvent } from '../server/ServerConfig';
import { Logger } from './Logger';

/**
 * Event bus for communication between components
 */
export class EventBus {
    private static _events = new vscode.EventEmitter<ServerEvent>();
    private static _logger?: Logger;

    /**
     * Initialize the event bus with logger
     * @param logger The logger instance
     */
    public static initialize(logger: Logger): void {
        EventBus._logger = logger;
    }

    /**
     * Subscribe to events
     * @param listener The event listener callback
     * @returns A disposable to unsubscribe
     */
    public static onEvent(listener: (e: ServerEvent) => any): vscode.Disposable {
        return EventBus._events.event(listener);
    }

    /**
     * Emit an event
     * @param event The event to emit
     */
    public static emit(event: ServerEvent): void {
        try {
            if (EventBus._logger) {
                EventBus._logger.log(`Event emitted: ${event.type} for server ${event.serverId}`);
            }

            EventBus._events.fire(event);
        } catch (error) {
            console.error('Error emitting event:', error);
            if (EventBus._logger) {
                EventBus._logger.error('Failed to emit event', error);
            }
        }
    }

    /**
     * Dispose the event bus
     */
    public static dispose(): void {
        EventBus._events.dispose();
    }
} 