export enum ServerType {
    PROCESS = 'process',
    SSE = 'sse'
}

export interface ServerConfig {
    name: string;
    type?: ServerType;
    command?: string;
    url?: string;
    authToken?: string;
    enabled: boolean;
    env?: { [key: string]: string };
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: any;
}

export interface Resource {
    name: string;
    type: string;
    settings: any;
}

export interface ServerWithTools extends ServerConfig {
    tools: Tool[];
    resources?: Resource[];
}

export interface EnvVar {
    key: string;
    value: string;
}