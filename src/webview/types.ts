export interface ServerConfig {
    id: string;
    name: string;
    command: string;
    enabled: boolean;
    env?: { [key: string]: string };
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: any;
}

export interface ServerWithTools extends ServerConfig {
    tools: Tool[];
}

export interface EnvVar {
    key: string;
    value: string;
}