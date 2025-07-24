#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import { join } from 'path';
import { LSPClient } from '../lib/lsp';
import { logger } from '../lib/config';

const program = new Command();

interface FileBlock {
  filename: string;
  content: string;
}

async function parseMarkdownFile(filePath: string): Promise<{ files: FileBlock[]; cursorPosition?: { file: string; line: number; character: number } }> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const files: FileBlock[] = [];
  let currentFile: FileBlock | null = null;
  let cursorPosition: { file: string; line: number; character: number } | undefined;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for file marker: // filename.ts
    const fileMatch = line.match(/^\/\/ (.+\.(ts|js|tsx|jsx|d\.ts))$/);
    if (fileMatch) {
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = {
        filename: fileMatch[1],
        content: ''
      };
      continue;
    }
    
    if (currentFile) {
      // Check for cursor marker /*!*/
      const cursorMatch = line.match(/\/\*!\*\//);
      if (cursorMatch) {
        const character = cursorMatch.index || 0;
        const lineNumber = currentFile.content.split('\n').length - 1;
        cursorPosition = {
          file: currentFile.filename,
          line: lineNumber,
          character
        };
        // Remove the cursor marker from the content
        currentFile.content += line.replace(/\/\*!\*\//, '') + '\n';
      } else {
        currentFile.content += line + '\n';
      }
    }
  }
  
  if (currentFile) {
    files.push(currentFile);
  }
  
  return { files, cursorPosition };
}

program
  .name('lsp-call')
  .description('Execute LSP operations on TypeScript files')
  .argument('<operation>', 'LSP operation (signature-help, completion, hover, definition, references)')
  .argument('[file]', 'Markdown file with TypeScript code blocks')
  .option('--cwd <path>', 'Working directory for file operations', process.cwd())
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (operation: string, file?: string, options?) => {
    try {
      if (options?.verbose) {
        process.env.LOG_LEVEL = 'debug';
      }

      const validOperations = ['signature-help', 'completion', 'hover', 'definition', 'references'];
      if (!validOperations.includes(operation)) {
        console.error(`Invalid operation: ${operation}`);
        console.error(`Valid operations: ${validOperations.join(', ')}`);
        process.exit(1);
      }

      if (!file) {
        console.error('No input file specified');
        process.exit(1);
      }

      logger('info', `Executing LSP operation: ${operation}`);
      logger('info', `Input file: ${file}`);
      
      const { files, cursorPosition } = await parseMarkdownFile(file);
      
      if (files.length === 0) {
        console.error('No TypeScript files found in markdown');
        process.exit(1);
      }

      if (!cursorPosition) {
        console.error('No cursor position (/*!*/) found in markdown');
        process.exit(1);
      }

      // Create a temporary folder for LSP operations
      const tempFolder = `lsp-${Date.now()}`;
      const lsp = new LSPClient(tempFolder);
      
      try {
        // Write files to disk
        const workingDir = join(options?.cwd || process.cwd(), '.working', 'repros', tempFolder);
        await fs.mkdir(workingDir, { recursive: true });
        
        for (const fileBlock of files) {
          const filePath = join(workingDir, fileBlock.filename);
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
        }

        // Output result
        if (result?.success) {
          console.log(result.output);
        } else {
          console.error('LSP operation failed:', result?.error);
          process.exit(1);
        }

      } finally {
        await lsp.close();
        
        // Clean up temp files
        try {
          const workingDir = join(options?.cwd || process.cwd(), '.working', 'repros', tempFolder);
          await fs.rm(workingDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      }

    } catch (error) {
      logger('error', 'LSP operation failed', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();