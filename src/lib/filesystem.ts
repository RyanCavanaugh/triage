import { promises as fs, existsSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { getConfig, logger } from './config';
import { ToolResult } from './types';

const execAsync = promisify(exec);

export class FileSystemOperations {
  private reproDir: string;
  private workingDir: string;

  constructor() {
    const config = getConfig();
    this.workingDir = resolve(config.workingDir);
    this.reproDir = resolve(config.reproDir);
  }

  async ensureWorkingDir(): Promise<void> {
    await fs.mkdir(this.workingDir, { recursive: true });
    await fs.mkdir(this.reproDir, { recursive: true });
  }

  async initializeRepro(folderName: string, additionalTscArgs?: string[]): Promise<ToolResult> {
    try {
      const reproPath = join(this.reproDir, folderName);
      logger('info', `Initializing repro folder: ${reproPath}`);

      // Create folder
      await fs.mkdir(reproPath, { recursive: true });

      // Run tsc --init
      const tscArgs = ['--init', ...(additionalTscArgs || [])];
      const tscCommand = `${getConfig().tscPath} ${tscArgs.join(' ')}`;
      
      execSync(tscCommand, { cwd: reproPath, stdio: 'pipe' });
      logger('info', `Executed: ${tscCommand}`);

      // Run npm init -y
      execSync('npm init -y', { cwd: reproPath, stdio: 'pipe' });
      logger('info', 'Executed: npm init -y');

      return {
        success: true,
        output: `Initialized repro folder ${folderName} with TypeScript and npm configuration`
      };
    } catch (error) {
      logger('error', `Failed to initialize repro folder ${folderName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async cloneRepo(repoUrl: string, folderName: string, commitOrBranch?: string): Promise<ToolResult> {
    try {
      const clonePath = join(this.reproDir, folderName);
      logger('info', `Cloning repo ${repoUrl} to ${clonePath}`);

      // Clone repository
      let cloneCommand = `git clone ${repoUrl} ${clonePath}`;
      execSync(cloneCommand, { stdio: 'pipe' });

      // Checkout specific commit/branch if specified
      if (commitOrBranch) {
        execSync(`git checkout ${commitOrBranch}`, { cwd: clonePath, stdio: 'pipe' });
        logger('info', `Checked out ${commitOrBranch}`);
      }

      // Determine package manager and install dependencies
      const packageJsonPath = join(clonePath, 'package.json');
      if (existsSync(packageJsonPath)) {
        let installCommand = 'npm ci';
        
        if (existsSync(join(clonePath, 'yarn.lock'))) {
          installCommand = 'yarn install';
        } else if (existsSync(join(clonePath, 'pnpm-lock.yaml'))) {
          installCommand = 'pnpm install';
        }

        try {
          execSync(installCommand, { cwd: clonePath, stdio: 'pipe' });
          logger('info', `Executed: ${installCommand}`);
        } catch (installError) {
          logger('warn', `Failed to install dependencies with ${installCommand}`, installError);
        }
      }

      return {
        success: true,
        output: `Successfully cloned ${repoUrl} to ${folderName}`
      };
    } catch (error) {
      logger('error', `Failed to clone repo ${repoUrl}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async writeFile(folderName: string, filePath: string, content: string): Promise<ToolResult> {
    try {
      // Ensure the file path is within the repro folder for security
      const reproPath = join(this.reproDir, folderName);
      const fullPath = join(reproPath, filePath);
      
      if (!fullPath.startsWith(reproPath)) {
        throw new Error('File path must be within the repro folder');
      }

      // Ensure directory exists
      await fs.mkdir(dirname(fullPath), { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');
      logger('info', `Wrote file: ${relative(this.reproDir, fullPath)}`);

      return {
        success: true,
        output: `Successfully wrote file ${filePath}`
      };
    } catch (error) {
      logger('error', `Failed to write file ${filePath}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async readFile(folderName: string, filePath: string): Promise<ToolResult> {
    try {
      const reproPath = join(this.reproDir, folderName);
      const fullPath = join(reproPath, filePath);
      
      if (!fullPath.startsWith(reproPath)) {
        throw new Error('File path must be within the repro folder');
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      logger('info', `Read file: ${relative(this.reproDir, fullPath)}`);

      return {
        success: true,
        output: content
      };
    } catch (error) {
      logger('error', `Failed to read file ${filePath}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async readDirectory(folderName: string, dirPath = '.'): Promise<ToolResult> {
    try {
      const reproPath = join(this.reproDir, folderName);
      const fullPath = join(reproPath, dirPath);
      
      if (!fullPath.startsWith(reproPath)) {
        throw new Error('Directory path must be within the repro folder');
      }

      const items = await fs.readdir(fullPath, { withFileTypes: true });
      const listing = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file'
      }));

      logger('info', `Listed directory: ${relative(this.reproDir, fullPath)}`);

      return {
        success: true,
        output: JSON.stringify(listing, null, 2)
      };
    } catch (error) {
      logger('error', `Failed to read directory ${dirPath}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runTsc(folderName: string, args: string[] = []): Promise<ToolResult> {
    try {
      const reproPath = join(this.reproDir, folderName);
      const tscCommand = `${getConfig().tscPath} ${args.join(' ')}`;
      
      logger('info', `Running TSC: ${tscCommand}`);

      const { stdout, stderr } = await execAsync(tscCommand, { cwd: reproPath });
      
      return {
        success: true,
        output: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
      };
    } catch (error: any) {
      logger('info', `TSC completed with non-zero exit code`);
      
      return {
        success: true, // TSC errors are expected and useful output
        output: `STDOUT:\n${error.stdout || ''}\n\nSTDERR:\n${error.stderr || ''}\n\nExit Code: ${error.code}`
      };
    }
  }

  async npmInstall(folderName: string, packages: string[]): Promise<ToolResult> {
    try {
      const reproPath = join(this.reproDir, folderName);
      const installCommand = `npm install ${packages.join(' ')}`;
      
      logger('info', `Installing packages: ${installCommand}`);

      const { stdout, stderr } = await execAsync(installCommand, { cwd: reproPath });
      
      return {
        success: true,
        output: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
      };
    } catch (error: any) {
      logger('error', `Failed to install packages: ${packages.join(', ')}`, error);
      return {
        success: false,
        error: `STDOUT:\n${error.stdout || ''}\n\nSTDERR:\n${error.stderr || ''}`
      };
    }
  }
}