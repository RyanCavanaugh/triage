import { promises as fs } from 'fs';
import { join } from 'path';
import { LSPClient } from './lsp';
import { logger } from './config';
import { FileBlock, CursorPosition } from './markdown-parser';

export type LSPOperation = 'signature-help' | 'completion' | 'hover' | 'definition' | 'references';

export interface LSPOperationOptions {
  operation: LSPOperation;
  files: FileBlock[];
  cursorPosition: CursorPosition;
  workingDir?: string;
}

export interface LSPOperationResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class LSPOrchestrator {
  async executeOperation(options: LSPOperationOptions): Promise<LSPOperationResult> {
    const { operation, files, cursorPosition, workingDir = process.cwd() } = options;
    
    // Create a temporary folder for LSP operations
    const tempFolder = `lsp-${Date.now()}`;
    const lsp = new LSPClient(tempFolder);
    
    try {
      // Write files to disk
      const targetWorkingDir = join(workingDir, '.working', 'repros', tempFolder);
      await fs.mkdir(targetWorkingDir, { recursive: true });
      
      for (const fileBlock of files) {
        const filePath = join(targetWorkingDir, fileBlock.filename);
        await fs.writeFile(filePath, fileBlock.content.trimEnd());
        logger('info', `Created file: ${fileBlock.filename}`);
      }

      // Start LSP server
      await lsp.start();

      // Open the target document
      const targetFile = files.find(f => f.filename === cursorPosition.file);
      if (!targetFile) {
        throw new Error(`Target file ${cursorPosition.file} not found`);
      }

      await lsp.openDocument(cursorPosition.file, targetFile.content);

      // Execute the requested operation
      let result;
      const { line, character } = cursorPosition;

      switch (operation) {
        case 'signature-help':
          result = await lsp.getSignatureHelp(cursorPosition.file, line, character);
          break;
        case 'completion':
          result = await lsp.getCompletion(cursorPosition.file, line, character);
          break;
        case 'hover':
          result = await lsp.getHover(cursorPosition.file, line, character);
          break;
        case 'definition':
          result = await lsp.getDefinition(cursorPosition.file, line, character);
          break;
        case 'references':
          result = await lsp.getReferences(cursorPosition.file, line, character);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return result;

    } finally {
      await lsp.close();
      
      // Clean up temp files
      try {
        const targetWorkingDir = join(workingDir, '.working', 'repros', tempFolder);
        await fs.rm(targetWorkingDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}