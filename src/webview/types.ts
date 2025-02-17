export interface ServerConfig {
    id: string;
    name: string;
    command: string;
    enabled: boolean;
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: any;
}

export interface ServerWithTools extends ServerConfig {
    tools: Tool[];
}