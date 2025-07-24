import OpenAI from 'openai';
import { DefaultAzureCredential } from '@azure/identity';
import { getConfig, logger } from './config';
import { ToolCall, ToolResult } from './types';

export class AIClient {
  private client: OpenAI;
  private deploymentName: string;

  constructor() {
    const config = getConfig();
    this.deploymentName = config.azure.deploymentName;
    
    // Create OpenAI client configured for Azure
    this.client = new OpenAI({
      baseURL: `${config.azure.openaiEndpoint}/openai/deployments/${this.deploymentName}`,
      defaultQuery: { 'api-version': config.azure.apiVersion },
      apiKey: this.getAzureToken()
    });
  }

  private getAzureToken(): string {
    // In a real implementation, this would use Azure credential to get token
    // For now, we'll assume the token is set via environment or az login
    try {
      const { execSync } = require('child_process');
      const token = execSync('az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken --output tsv', 
        { encoding: 'utf-8' }).trim();
      return token;
    } catch (error) {
      logger('error', 'Failed to get Azure token. Make sure you are logged in with `az login`', error);
      throw new Error('Azure authentication failed');
    }
  }

  async analyzeIssue(
    issueTitle: string, 
    issueBody: string, 
    comments: string[],
    availableTools: string[]
  ): Promise<{ analysis: string; suggestedTools: ToolCall[] }> {
    const systemPrompt = `You are an expert TypeScript engineer helping to test if reported bugs still reproduce in the current version.

Available tools:
- initialize_repro: Set up a new reproduction folder with tsc --init and npm init -y
- clone_repo: Clone a GitHub repository at a specific commit/branch
- write_file: Write files to the reproduction folder
- read_file: Read files from the reproduction folder
- read_directory: List directory contents
- run_tsc: Run TypeScript compiler
- npm_install: Install npm packages
- lsp_operation: Test Language Server Protocol operations

Your task is to analyze the issue and determine the best approach to test if it still reproduces. 
Provide a clear analysis and suggest specific tool calls to test the issue.

Focus on:
1. Understanding what the bug is supposed to do
2. Creating minimal reproduction code
3. Testing with current TypeScript version
4. Checking if expected vs actual behavior matches

Be surgical and precise - only test what's necessary to validate the bug.`;

    const userPrompt = `Issue: ${issueTitle}

Description:
${issueBody}

Comments:
${comments.join('\n\n---\n\n')}

Please analyze this issue and suggest the appropriate tool calls to test if this bug still reproduces.`;

    try {
      logger('info', 'Analyzing issue with AI');
      
      const response = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Parse the response to extract tool calls
      // This is a simplified parser - in practice you might want more sophisticated parsing
      const suggestedTools: ToolCall[] = this.parseToolCalls(content);

      return {
        analysis: content,
        suggestedTools
      };
    } catch (error) {
      logger('error', 'Failed to analyze issue with AI', error);
      throw error;
    }
  }

  private parseToolCalls(content: string): ToolCall[] {
    const tools: ToolCall[] = [];
    
    // Look for tool call patterns in the response
    // This is a basic implementation - you might want to use function calling or more structured parsing
    const toolPatterns = [
      /initialize_repro\(([^)]*)\)/g,
      /clone_repo\(([^)]*)\)/g,
      /write_file\(([^)]*)\)/g,
      /read_file\(([^)]*)\)/g,
      /run_tsc\(([^)]*)\)/g,
      /npm_install\(([^)]*)\)/g,
      /lsp_operation\(([^)]*)\)/g
    ];

    toolPatterns.forEach((pattern, index) => {
      const toolTypes = ['initialize_repro', 'clone_repo', 'write_file', 'read_file', 'run_tsc', 'npm_install', 'lsp_operation'];
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        try {
          const params = match[1] ? JSON.parse(`{${match[1]}}`) : {};
          tools.push({
            type: toolTypes[index] as any,
            parameters: params
          });
        } catch (e) {
          // Skip malformed tool calls
          logger('warn', `Failed to parse tool call: ${match[0]}`);
        }
      }
    });

    return tools;
  }

  async generateSummary(
    issueTitle: string,
    testSteps: string[],
    result: { reproduced: boolean; details: string }
  ): Promise<string> {
    const prompt = `Generate a clear, concise summary of testing results for this TypeScript issue:

Issue: ${issueTitle}

Test Steps Performed:
${testSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Result: ${result.reproduced ? 'Bug reproduced' : 'Bug not reproduced'}
Details: ${result.details}

Please provide a markdown summary suitable for sharing with the issue reporter that explains:
1. What was tested
2. The outcome
3. Current status of the bug

Be professional and helpful.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000
      });

      return response.choices[0]?.message?.content || 'Failed to generate summary';
    } catch (error) {
      logger('error', 'Failed to generate summary', error);
      return 'Failed to generate summary due to AI service error';
    }
  }
}