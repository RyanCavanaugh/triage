import { 
  createMessageConnection, 
  MessageConnection, 
  StreamMessageReader, 
  StreamMessageWriter,
  RequestType,
  NotificationType
} from 'vscode-jsonrpc/node';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { getConfig, logger } from './config';
import { LSPRequest, LSPResponse, ToolResult } from './types';

export class LSPClient {
  private connection: MessageConnection | null = null;
  private serverProcess: ChildProcess | null = null;
  private reproPath: string;

  constructor(folderName: string) {
    const config = getConfig();
    this.reproPath = join(config.reproDir, folderName);
  }

  async start(): Promise<void> {
    try {
      logger('info', 'Starting TypeScript Language Server');
      
      // Start typescript-language-server
      this.serverProcess = spawn(getConfig().tscLspPath, ['--stdio'], {
        cwd: this.reproPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (!this.serverProcess.stdin || !this.serverProcess.stdout) {
        throw new Error('Failed to create LSP server process streams');
      }

      // Create JSON RPC connection
      const reader = new StreamMessageReader(this.serverProcess.stdout);
      const writer = new StreamMessageWriter(this.serverProcess.stdin);
      this.connection = createMessageConnection(reader, writer);

      // Handle connection errors
      this.connection.onError((error) => {
        logger('error', 'LSP connection error', error);
      });

      this.connection.onClose(() => {
        logger('info', 'LSP connection closed');
      });

      // Start listening
      this.connection.listen();

      // Initialize the server
      await this.initialize();

      logger('info', 'LSP client started successfully');
    } catch (error) {
      logger('error', 'Failed to start LSP client', error);
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    if (!this.connection) {
      throw new Error('LSP connection not established');
    }

    const initializeRequest = new RequestType<any, any, any>('initialize');
    
    const initParams = {
      processId: process.pid,
      rootUri: `file://${this.reproPath}`,
      capabilities: {
        textDocument: {
          hover: { dynamicRegistration: false },
          signatureHelp: { dynamicRegistration: false },
          completion: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false }
        }
      }
    };

    await this.connection.sendRequest(initializeRequest, initParams);
    
    const initializedNotification = new NotificationType<any>('initialized');
    this.connection.sendNotification(initializedNotification, {});
  }

  async openDocument(filePath: string, content: string): Promise<void> {
    if (!this.connection) {
      throw new Error('LSP connection not established');
    }

    const didOpenNotification = new NotificationType<any>('textDocument/didOpen');
    
    this.connection.sendNotification(didOpenNotification, {
      textDocument: {
        uri: `file://${join(this.reproPath, filePath)}`,
        languageId: 'typescript',
        version: 1,
        text: content
      }
    });
  }

  async getSignatureHelp(filePath: string, line: number, character: number): Promise<ToolResult> {
    try {
      if (!this.connection) {
        throw new Error('LSP connection not established');
      }

      const signatureHelpRequest = new RequestType<any, any, any>('textDocument/signatureHelp');
      
      const result = await this.connection.sendRequest(signatureHelpRequest, {
        textDocument: { uri: `file://${join(this.reproPath, filePath)}` },
        position: { line, character }
      });

      return {
        success: true,
        output: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      logger('error', 'Failed to get signature help', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getCompletion(filePath: string, line: number, character: number): Promise<ToolResult> {
    try {
      if (!this.connection) {
        throw new Error('LSP connection not established');
      }

      const completionRequest = new RequestType<any, any, any>('textDocument/completion');
      
      const result = await this.connection.sendRequest(completionRequest, {
        textDocument: { uri: `file://${join(this.reproPath, filePath)}` },
        position: { line, character }
      });

      return {
        success: true,
        output: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      logger('error', 'Failed to get completion', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getHover(filePath: string, line: number, character: number): Promise<ToolResult> {
    try {
      if (!this.connection) {
        throw new Error('LSP connection not established');
      }

      const hoverRequest = new RequestType<any, any, any>('textDocument/hover');
      
      const result = await this.connection.sendRequest(hoverRequest, {
        textDocument: { uri: `file://${join(this.reproPath, filePath)}` },
        position: { line, character }
      });

      return {
        success: true,
        output: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      logger('error', 'Failed to get hover', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getDefinition(filePath: string, line: number, character: number): Promise<ToolResult> {
    try {
      if (!this.connection) {
        throw new Error('LSP connection not established');
      }

      const definitionRequest = new RequestType<any, any, any>('textDocument/definition');
      
      const result = await this.connection.sendRequest(definitionRequest, {
        textDocument: { uri: `file://${join(this.reproPath, filePath)}` },
        position: { line, character }
      });

      return {
        success: true,
        output: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      logger('error', 'Failed to get definition', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getReferences(filePath: string, line: number, character: number): Promise<ToolResult> {
    try {
      if (!this.connection) {
        throw new Error('LSP connection not established');
      }

      const referencesRequest = new RequestType<any, any, any>('textDocument/references');
      
      const result = await this.connection.sendRequest(referencesRequest, {
        textDocument: { uri: `file://${join(this.reproPath, filePath)}` },
        position: { line, character },
        context: { includeDeclaration: true }
      });

      return {
        success: true,
        output: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      logger('error', 'Failed to get references', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    logger('info', 'LSP client closed');
  }
}