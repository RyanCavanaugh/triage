#!/usr/bin/env node

import { Command } from 'commander';
import { TriageAgent } from '../lib/agent';
import { logger, getConfig } from '../lib/config';

const program = new Command();

program
  .name('comb-backlog-bugs')
  .description('Process all open Bug-labeled issues in a repository')
  .option('-o, --owner <owner>', 'Repository owner', 'Microsoft')
  .option('-r, --repo <repo>', 'Repository name', 'TypeScript')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      if (options.verbose) {
        process.env.LOG_LEVEL = 'debug';
      }

      const { owner, repo } = options;
      
      logger('info', `Starting backlog triage for ${owner}/${repo}`);
      logger('info', `Results will be saved to: ${getConfig().bugsDir}`);
      
      const agent = new TriageAgent();
      await agent.combBacklogBugs(owner, repo);
      
      console.log('\n' + '='.repeat(80));
      console.log('BACKLOG TRIAGE COMPLETED');
      console.log('='.repeat(80));
      console.log(`Repository: ${owner}/${repo}`);
      console.log(`Results saved to: ${getConfig().bugsDir}`);
      console.log('='.repeat(80));
      
      process.exit(0);
    } catch (error) {
      logger('error', 'Failed to comb backlog bugs', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();