import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import { Issue, Comment } from './types';
import { logger } from './config';

export class GitHubClient {
  private octokit: Octokit;

  constructor() {
    // Get auth token from gh CLI
    const token = this.getGitHubToken();
    this.octokit = new Octokit({ auth: token });
  }

  private getGitHubToken(): string {
    try {
      const token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
      return token;
    } catch (error) {
      logger('error', 'Failed to get GitHub token. Make sure you are logged in with `gh auth login`', error);
      throw new Error('GitHub authentication failed');
    }
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    try {
      logger('info', `Fetching issue ${owner}/${repo}#${issueNumber}`);
      
      const [issueResponse, commentsResponse] = await Promise.all([
        this.octokit.issues.get({ owner, repo, issue_number: issueNumber }),
        this.octokit.issues.listComments({ owner, repo, issue_number: issueNumber })
      ]);

      const comments: Comment[] = commentsResponse.data.map(comment => ({
        id: comment.id,
        body: comment.body || '',
        user: comment.user?.login || 'unknown',
        created_at: comment.created_at
      }));

      return {
        number: issueResponse.data.number,
        title: issueResponse.data.title,
        body: issueResponse.data.body || '',
        url: issueResponse.data.html_url,
        labels: issueResponse.data.labels.map(label => typeof label === 'string' ? label : label.name || ''),
        state: issueResponse.data.state,
        comments
      };
    } catch (error) {
      logger('error', `Failed to fetch issue ${owner}/${repo}#${issueNumber}`, error);
      throw error;
    }
  }

  async getBugIssues(owner: string, repo: string, page = 1, perPage = 30): Promise<Issue[]> {
    try {
      logger('info', `Fetching bug issues from ${owner}/${repo} (page ${page})`);
      
      const response = await this.octokit.issues.listForRepo({
        owner,
        repo,
        labels: 'Bug',
        state: 'open',
        page,
        per_page: perPage
      });

      const issues: Issue[] = [];
      
      for (const issue of response.data) {
        if (!issue.pull_request) { // Exclude pull requests
          const comments: Comment[] = [];
          
          if (issue.comments > 0) {
            const commentsResponse = await this.octokit.issues.listComments({
              owner,
              repo,
              issue_number: issue.number
            });
            
            comments.push(...commentsResponse.data.map(comment => ({
              id: comment.id,
              body: comment.body || '',
              user: comment.user?.login || 'unknown',
              created_at: comment.created_at
            })));
          }

          issues.push({
            number: issue.number,
            title: issue.title,
            body: issue.body || '',
            url: issue.html_url,
            labels: issue.labels.map(label => typeof label === 'string' ? label : label.name || ''),
            state: issue.state,
            comments
          });
        }
      }

      return issues;
    } catch (error) {
      logger('error', `Failed to fetch bug issues from ${owner}/${repo}`, error);
      throw error;
    }
  }

  parseIssueRef(ref: string): { owner: string; repo: string; number: number } {
    // Handle URLs like https://github.com/Microsoft/TypeScript/issues/9998
    const urlMatch = ref.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);
    if (urlMatch) {
      return {
        owner: urlMatch[1],
        repo: urlMatch[2],
        number: parseInt(urlMatch[3])
      };
    }

    // Handle refs like Microsoft/TypeScript#9998
    const refMatch = ref.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
    if (refMatch) {
      return {
        owner: refMatch[1],
        repo: refMatch[2],
        number: parseInt(refMatch[3])
      };
    }

    throw new Error(`Invalid issue reference: ${ref}`);
  }
}