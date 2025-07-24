#!/usr/bin/env node

import { Command } from 'commander';
import { TriageAgent } from '../lib/agent';
import { logger } from '../lib/config';

const program = new Command();

program
  .name('repro-issue')
  .description('Test if a TypeScript issue still reproduces')
  .argument('<issue-ref>', 'Issue reference (Microsoft/TypeScript#9998 or URL)')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (issueRef: string, options) => {
    try {
      if (options.verbose) {
        process.env.LOG_LEVEL = 'debug';
      }

      logger('info', `Testing issue: ${issueRef}`);
      
      const agent = new TriageAgent();
      const result = await agent.testIssue(issueRef);
      
      // Output result to stdout
      console.log('\n' + '='.repeat(80));
      console.log('ISSUE TESTING RESULT');
      console.log('='.repeat(80));
      console.log(`Issue: #${result.issueNumber}`);
      console.log(`Tested: ${result.tested ? 'Yes' : 'No'}`);
      console.log(`Reproduced: ${result.reproduced ? 'Yes' : 'No'}`);
      console.log(`Timestamp: ${result.timestamp}`);
      
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      
      console.log('\nTest Steps:');
      result.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`);
      });
      
      console.log('\nSummary:');
      console.log(result.summary);
      console.log('='.repeat(80));
      
      // Exit with appropriate code
      process.exit(result.tested ? 0 : 1);
    } catch (error) {
      logger('error', 'Failed to test issue', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();