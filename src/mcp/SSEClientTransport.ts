import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';

/**
 * Transport interface for the MCP client
 */
export interface Transport {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(data: any): Promise<void>;
    onMessage(callback: (data: any) => void): void;
}

/**
 * A transport implementation for MCP that uses Server-Sent Events
 */
export class SSEClientTransport implements Transport {
    private _eventSource: EventSource | null = null;
    private _isConnected = false;
    private _messageCallback: ((data: any) => void) | null = null;
    private _connectionPromise: Promise<void> | null = null;
    private _resolveConnection: (() => void) | null = null;
    private _rejectConnection: ((error: Error) => void) | null = null;
    private _logger?: Logger;

    /**
     * Creates a new SSE transport
     * @param url The URL of the SSE server
     * @param authToken Authentication token (if required)
     */
    constructor(
        private readonly url: string,
        private readonly authToken?: string
    ) {
        try {
            this._logger = Logger.getInstance();
        } catch (error) {
            // Logger not initialized
        }
    }

    /**
     * Connect to the SSE server
     */
    public connect(): Promise<void> {
        if (this._isConnected) {
            return Promise.resolve();
        }

        if (this._connectionPromise) {
            return this._connectionPromise;
        }

        this._connectionPromise = new Promise<void>((resolve, reject) => {
            this._resolveConnection = resolve;
            this._rejectConnection = reject;

            try {
                // Create headers if we have an auth token
                const headers: HeadersInit = {};
                if (this.authToken) {
                    headers['Authorization'] = `Bearer ${this.authToken}`;
                }

                // Create EventSource
                this._eventSource = new EventSource(this.url, {
                    withCredentials: !!this.authToken
                });

                // Setup event handlers
                this._eventSource.onopen = this._handleOpen.bind(this);
                this._eventSource.onerror = this._handleError.bind(this);
                this._eventSource.onmessage = this._handleMessage.bind(this);

                if (this._logger) {
                    this._logger.log(`Connecting to SSE server at ${this.url}`);
                }
            } catch (error) {
                this._rejectConnection?.(error instanceof Error ? error : new Error(String(error)));
                this._connectionPromise = null;
                ErrorHandler.handleError('SSE Connection', error);
            }
        });

        return this._connectionPromise;
    }

    /**
     * Disconnect from the SSE server
     */
    public disconnect(): Promise<void> {
        if (!this._isConnected || !this._eventSource) {
            return Promise.resolve();
        }

        this._isConnected = false;
        this._eventSource.close();
        this._eventSource = null;
        this._connectionPromise = null;
        this._resolveConnection = null;
        this._rejectConnection = null;

        if (this._logger) {
            this._logger.log(`Disconnected from SSE server at ${this.url}`);
        }

        return Promise.resolve();
    }

    /**
     * Send a message to the server (not used for SSE, which is one-way)
     * @param data The message data to send
     */
    public send(data: any): Promise<void> {
        // SSE is one-way, so sending is not supported
        return Promise.reject(new Error('Send operation not supported with SSE transport'));
    }

    /**
     * Register a callback for incoming messages
     * @param callback The callback function for messages
     */
    public onMessage(callback: (data: any) => void): void {
        this._messageCallback = callback;
    }

    /**
     * Handle connection open event
     */
    private _handleOpen(): void {
        this._isConnected = true;
        this._resolveConnection?.();

        if (this._logger) {
            this._logger.log(`Connected to SSE server at ${this.url}`);
        }
    }

    /**
     * Handle connection error event
     * @param event The error event
     */
    private _handleError(event: Event): void {
        const error = new Error('SSE connection error');

        if (!this._isConnected && this._rejectConnection) {
            this._rejectConnection(error);
            this._connectionPromise = null;
        }

        ErrorHandler.handleError('SSE Connection', error);

        if (this._logger) {
            this._logger.log(`Error connecting to SSE server at ${this.url}: ${error.message}`);
        }
    }

    /**
     * Handle incoming message event
     * @param event The message event
     */
    private _handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);
            this._messageCallback?.(data);

            if (this._logger && data.method) {
                this._logger.log(`Received message from SSE server: ${data.method}`);
            }
        } catch (error) {
            ErrorHandler.handleError('SSE Message Parsing', error);

            if (this._logger) {
                this._logger.log(`Error parsing SSE message: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
} 