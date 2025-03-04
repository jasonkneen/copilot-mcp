export enum ServerType {
    PROCESS = 'process',
    SSE = 'sse'
}

export interface ChatParticipant {
    enabled: boolean;
    name?: string;
    shortName?: string;
    description?: string;
    isSticky?: boolean;
}

export interface ServerConfig {
    id: string;     // Unique identifier for the server
    name: string;   // Display name
    type?: ServerType;
    command?: string;
    url?: string;
    authToken?: string;
    enabled: boolean;
    env?: { [key: string]: string };
    chatParticipant?: ChatParticipant;
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
    isConnected?: boolean; // Track actual connection state separately from enabled setting
    isToggling?: boolean;  // Track if the server is in the process of toggling
}

export interface ServerInstance {
    id: string;
    pid: number;
    serverPath: string;
    serverName: string;
    launchSource: string; // 'cli' or extension ID
    startTime: number;
    serverConfig: string;
    contextInfo: Record<string, any>;
    connectionType: 'sse' | 'stdio';
    lastHealthCheck?: number;
    status: 'running' | 'stopped' | 'error';
}

export interface InstancesStatusData {
    totalInstances: number;
    runningCount: number;
    errorCount: number;
    instancesByServer: Record<string, ServerInstance[]>;
    servers: string[];
    timestamp: string;
}

export interface EnvVar {
    key: string;
    value: string;
}