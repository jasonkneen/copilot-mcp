import { Tool, Resource } from '@modelcontextprotocol/sdk/types';

/**
 * Server types supported by the extension
 */
export enum ServerType {
    /** Command-line process server */
    PROCESS = 'process',
    /** Server-Sent Events (SSE) server */
    SSE = 'sse'
}

/**
 * Server configuration interface
 */
export interface ServerConfig {
    id: string;
    name: string;
    type: ServerType;
    command?: string;
    url?: string;
    authToken?: string;
    enabled: boolean;
    env?: { [key: string]: string };
}

/**
 * Server with tools and resources
 */
export interface ServerWithTools extends ServerConfig {
    running: boolean;
    tools?: Tool[];
    resources?: Resource[];
}

export interface EnvVar {
    key: string;
    value: string;
}