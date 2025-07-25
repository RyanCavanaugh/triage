import { promises as fs } from 'fs';

export interface FileBlock {
  filename: string;
  content: string;
}

export interface CursorPosition {
  file: string;
  line: number;
  character: number;
}

export interface ParsedMarkdown {
  files: FileBlock[];
  cursorPosition?: CursorPosition;
}

export async function parseMarkdownFile(filePath: string): Promise<ParsedMarkdown> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const files: FileBlock[] = [];
  let currentFile: FileBlock | null = null;
  let cursorPosition: CursorPosition | undefined;
  
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