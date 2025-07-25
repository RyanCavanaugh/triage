import { readFileSync } from 'fs';
import { join } from 'path';
import { Config } from './types';

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    const configPath = join(process.cwd(), 'config.json');
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  }
  return config!;
}

export function logger(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else if (level === 'warn') {
    console.warn(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}