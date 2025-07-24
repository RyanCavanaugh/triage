import { Issue, ToolCall, ToolResult, TestResult } from './types';
import { GitHubClient } from './github';
import { AIClient } from './ai';
import { FileSystemOperations } from './filesystem';
import { LSPClient } from './lsp';
import { getConfig, logger } from './config';

export class TriageAgent {
  private github: GitHubClient;
  private ai: AIClient;
  private fs: FileSystemOperations;
  private config = getConfig();

  constructor() {
    this.github = new GitHubClient();
    this.ai = new AIClient();
    this.fs = new FileSystemOperations();
  }

  async testIssue(issueRef: string): Promise<TestResult> {
    const startTime = new Date().toISOString();
    logger('info', `Starting test for issue: ${issueRef}`);

    try {
      // Parse issue reference and fetch issue data
      const { owner, repo, number } = this.github.parseIssueRef(issueRef);
      const issue = await this.github.getIssue(owner, repo, number);
      
      logger('info', `Testing issue: ${issue.title}`);

      // Prepare issue context for AI
      const comments = issue.comments.map(c => `${c.user}: ${c.body}`);
      
      // Analyze issue with AI
      const { analysis, suggestedTools } = await this.ai.analyzeIssue(
        issue.title,
        issue.body,
        comments,
        ['initialize_repro', 'clone_repo', 'write_file', 'read_file', 'read_directory', 'run_tsc', 'npm_install', 'lsp_operation']
      );

      logger('info', 'AI analysis completed', { toolCount: suggestedTools.length });

      // Ensure working directory exists
      await this.fs.ensureWorkingDir();

      // Execute suggested tool calls
      const testSteps: string[] = [];
      const reproFolderName = `issue-${number}-${Date.now()}`;
      let reproduced = false;
      let testDetails = '';

      for (let i = 0; i < suggestedTools.length && i < this.config.agent.maxToolCalls; i++) {
        const tool = suggestedTools[i];
        logger('info', `Executing tool: ${tool.type}`, tool.parameters);

        const result = await this.executeTool(tool, reproFolderName);
        const stepDescription = `${tool.type}(${JSON.stringify(tool.parameters)})`;
        
        if (result.success) {
          testSteps.push(`✓ ${stepDescription}: ${result.output?.substring(0, 100)}...`);
          testDetails += `Step ${i + 1}: ${stepDescription}\nResult: ${result.output}\n\n`;
        } else {
          testSteps.push(`✗ ${stepDescription}: ${result.error}`);
          testDetails += `Step ${i + 1}: ${stepDescription}\nError: ${result.error}\n\n`;
          
          // If this was a critical step like running TSC, check if error indicates bug reproduction
          if (tool.type === 'run_tsc' && result.error) {
            reproduced = this.analyzeCompilerOutput(result.error, issue.body);
          }
        }
      }

      // Generate summary
      const summary = await this.ai.generateSummary(
        issue.title,
        testSteps,
        { reproduced, details: testDetails }
      );

      return {
        issueNumber: number,
        tested: true,
        reproduced,
        summary,
        steps: testSteps,
        timestamp: startTime
      };

    } catch (error) {
      logger('error', `Failed to test issue ${issueRef}`, error);
      
      return {
        issueNumber: 0,
        tested: false,
        reproduced: false,
        summary: `Failed to test issue: ${error instanceof Error ? error.message : String(error)}`,
        steps: [],
        error: error instanceof Error ? error.message : String(error),
        timestamp: startTime
      };
    }
  }

  private async executeTool(tool: ToolCall, reproFolderName: string): Promise<ToolResult> {
    switch (tool.type) {
      case 'initialize_repro':
        return this.fs.initializeRepro(reproFolderName, tool.parameters.additionalArgs);

      case 'clone_repo':
        return this.fs.cloneRepo(
          tool.parameters.url,
          tool.parameters.folderName || reproFolderName,
          tool.parameters.commitOrBranch
        );

      case 'write_file':
        return this.fs.writeFile(
          reproFolderName,
          tool.parameters.filePath,
          tool.parameters.content
        );

      case 'read_file':
        return this.fs.readFile(reproFolderName, tool.parameters.filePath);

      case 'read_directory':
        return this.fs.readDirectory(reproFolderName, tool.parameters.dirPath);

      case 'run_tsc':
        return this.fs.runTsc(reproFolderName, tool.parameters.args || []);

      case 'npm_install':
        return this.fs.npmInstall(reproFolderName, tool.parameters.packages || []);

      case 'lsp_operation':
        return this.executeLSPOperation(reproFolderName, tool.parameters);

      default:
        return {
          success: false,
          error: `Unknown tool type: ${tool.type}`
        };
    }
  }

  private async executeLSPOperation(reproFolderName: string, params: any): Promise<ToolResult> {
    const lsp = new LSPClient(reproFolderName);
    
    try {
      await lsp.start();

      // Open document if specified
      if (params.filePath && params.content) {
        await lsp.openDocument(params.filePath, params.content);
      }

      // Execute specific LSP operation
      let result: ToolResult;
      const { operation, filePath, line, character } = params;

      switch (operation) {
        case 'signature-help':
          result = await lsp.getSignatureHelp(filePath, line, character);
          break;
        case 'completion':
          result = await lsp.getCompletion(filePath, line, character);
          break;
        case 'hover':
          result = await lsp.getHover(filePath, line, character);
          break;
        case 'definition':
          result = await lsp.getDefinition(filePath, line, character);
          break;
        case 'references':
          result = await lsp.getReferences(filePath, line, character);
          break;
        default:
          result = { success: false, error: `Unknown LSP operation: ${operation}` };
      }

      return result;
    } finally {
      await lsp.close();
    }
  }

  private analyzeCompilerOutput(output: string, issueBody: string): boolean {
    // Simple heuristic to determine if compiler output indicates bug reproduction
    // This could be made more sophisticated with AI analysis
    
    const errorKeywords = ['error', 'Error', 'TypeError', 'ReferenceError'];
    const hasError = errorKeywords.some(keyword => output.includes(keyword));
    
    // Look for specific error patterns mentioned in the issue
    const issueWords = issueBody.toLowerCase().split(/\s+/);
    const outputWords = output.toLowerCase().split(/\s+/);
    
    let matchCount = 0;
    for (const word of issueWords) {
      if (word.length > 3 && outputWords.includes(word)) {
        matchCount++;
      }
    }
    
    // Consider it reproduced if there are errors and some context match
    return hasError && matchCount > 2;
  }

  async combBacklogBugs(owner: string, repo: string): Promise<void> {
    logger('info', `Starting backlog triage for ${owner}/${repo}`);
    
    try {
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const issues = await this.github.getBugIssues(owner, repo, page, this.config.github.maxIssuesPerBatch);
        
        if (issues.length === 0) {
          hasMore = false;
          break;
        }

        logger('info', `Processing ${issues.length} issues from page ${page}`);

        for (const issue of issues) {
          try {
            const result = await this.testIssue(`${owner}/${repo}#${issue.number}`);
            await this.saveResults(result);
            
            // Small delay to avoid overwhelming the services
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger('error', `Failed to process issue #${issue.number}`, error);
          }
        }

        page++;
      }

      logger('info', 'Backlog triage completed');
    } catch (error) {
      logger('error', 'Failed to comb backlog bugs', error);
      throw error;
    }
  }

  private async saveResults(result: TestResult): Promise<void> {
    const { promises: fs } = require('fs');
    const { join } = require('path');
    
    const bugsDir = this.config.bugsDir;
    await fs.mkdir(bugsDir, { recursive: true });
    
    const fileName = `issue-${result.issueNumber}-${Date.now()}`;
    
    // Save JSON result
    const jsonPath = join(bugsDir, `${fileName}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    
    // Save markdown summary
    const mdPath = join(bugsDir, `${fileName}.md`);
    await fs.writeFile(mdPath, result.summary);
    
    logger('info', `Saved results for issue #${result.issueNumber}`);
  }
}