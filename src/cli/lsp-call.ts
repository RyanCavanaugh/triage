#!/usr/bin/env node

import { Command } from 'commander';
import { parseMarkdownFile } from '../lib/markdown-parser';
import { LSPOrchestrator, LSPOperation } from '../lib/lsp-orchestrator';
import { logger } from '../lib/config';

const program = new Command();

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

      const validOperations: LSPOperation[] = ['signature-help', 'completion', 'hover', 'definition', 'references'];
      if (!validOperations.includes(operation as LSPOperation)) {
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
      
      // Parse markdown file
      const { files, cursorPosition } = await parseMarkdownFile(file);
      
      if (files.length === 0) {
        console.error('No TypeScript files found in markdown');
        process.exit(1);
      }

      if (!cursorPosition) {
        console.error('No cursor position (/*!*/) found in markdown');
        process.exit(1);
      }

      // Execute LSP operation
      const orchestrator = new LSPOrchestrator();
      const result = await orchestrator.executeOperation({
        operation: operation as LSPOperation,
        files,
        cursorPosition,
        workingDir: options?.cwd || process.cwd()
      });

      // Output result
      if (result.success) {
        console.log(result.output);
      } else {
        console.error('LSP operation failed:', result.error);
        process.exit(1);
      }

    } catch (error) {
      logger('error', 'LSP operation failed', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();