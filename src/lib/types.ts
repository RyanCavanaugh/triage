export interface Config {
  tscPath: string;
  tscLspPath: string;
  defaultRepo: string;
  workingDir: string;
  reproDir: string;
  bugsDir: string;
  azure: {
    openaiEndpoint: string;
    deploymentName: string;
    apiVersion: string;
  };
  github: {
    maxIssuesPerBatch: number;
    retryAttempts: number;
  };
  agent: {
    maxToolCalls: number;
    timeoutMs: number;
  };
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  state: string;
  comments: Comment[];
}

export interface Comment {
  id: number;
  body: string;
  user: string;
  created_at: string;
}

export interface TestResult {
  issueNumber: number;
  tested: boolean;
  reproduced: boolean;
  summary: string;
  steps: string[];
  error?: string;
  timestamp: string;
}

export interface ToolCall {
  type: 'initialize_repro' | 'clone_repo' | 'write_file' | 'read_file' | 'read_directory' | 'run_tsc' | 'npm_install' | 'lsp_operation';
  parameters: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface LSPRequest {
  method: string;
  params: any;
}

export interface LSPResponse {
  result?: any;
  error?: any;
}