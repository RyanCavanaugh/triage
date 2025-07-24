# Triage - AI-Powered TypeScript Issue Testing Tool

An intelligent backlog grooming tool that uses AI to automatically test if TypeScript issues still reproduce in the current version.

## Features

- **Automated Issue Testing**: Uses AI to understand issues and create appropriate test scenarios
- **Multi-Tool Agent**: Integrates TypeScript compiler, LSP server, file operations, and package management
- **GitHub Integration**: Fetches issues directly from GitHub repositories using `gh` CLI
- **Azure OpenAI**: Leverages Azure OpenAI for intelligent analysis using Entra ID authentication
- **LSP Testing**: Can test Language Server Protocol operations like completion, hover, signature help
- **Batch Processing**: Process multiple issues automatically
- **Comprehensive Reporting**: Generates markdown summaries and JSON results

## Prerequisites

1. **GitHub CLI**: Install and login with `gh auth login`
2. **Azure CLI**: Install and login with `az login` 
3. **TypeScript**: Install TypeScript globally (`npm install -g typescript`)
4. **TypeScript Language Server**: Install typescript-language-server (`npm install -g typescript-language-server`)

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Configure `config.json` with your Azure OpenAI endpoint

## Usage

### Test a Single Issue

```bash
npm run repro-issue "Microsoft/TypeScript#12345"
# or
npm run repro-issue "https://github.com/Microsoft/TypeScript/issues/12345"
```

### Process All Bug-Labeled Issues

```bash
npm run comb-backlog-bugs --owner Microsoft --repo TypeScript
```

### Test LSP Operations

Create a markdown file with TypeScript code:

```markdown
// foo.ts
export function myFunction(param: string) { 
  return param.toUpperCase();
}

// bar.ts
import { myFunction } from "./foo.js";
myFunction(/*!*/);
```

Then run:

```bash
npm run lsp-call signature-help test.md
```

## Architecture

- `src/lib/agent.ts` - Main orchestration logic
- `src/lib/github.ts` - GitHub API integration
- `src/lib/ai.ts` - Azure OpenAI client
- `src/lib/filesystem.ts` - File and TypeScript operations
- `src/lib/lsp.ts` - Language Server Protocol client
- `src/cli/` - Command-line interfaces

## Configuration

Edit `config.json` to customize:

- TypeScript compiler paths
- Azure OpenAI endpoint and deployment
- Working directories
- Agent behavior limits

## Output

Results are saved to `.working/bugs/` with:
- JSON files containing detailed test results
- Markdown summaries suitable for sharing with issue reporters