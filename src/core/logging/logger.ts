import fs from 'node:fs';
import path from 'node:path';
import { getSaleFlowLogDir } from '../config/env';

export interface LogMetadata {
  [key: string]: any;
}

/**
 * Sanitizes metadata to prevent passwords, PINs, tokens, or license private keys
 * from ever appearing in log files or console output.
 */
function sanitizeData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeData);

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('pin') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('privatekey') ||
      lowerKey.includes('token') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('cookie')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object') {
      sanitized[key] = sanitizeData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

class AppLogger {
  private logFilePath: string | null = null;

  private getLogFile(): string {
    if (!this.logFilePath) {
      try {
        const logDir = getSaleFlowLogDir();
        this.logFilePath = path.join(logDir, 'saleflow.log');
      } catch {
        this.logFilePath = path.join(process.cwd(), 'logs', 'saleflow.log');
      }
    }
    return this.logFilePath;
  }

  private writeToFile(level: 'INFO' | 'WARN' | 'ERROR', category: string, message: string, metadata?: LogMetadata, error?: any) {
    const timestamp = new Date().toISOString();
    let logLine = `[SaleFlow ${level} ${timestamp}] [${category}] ${message}`;

    if (metadata && Object.keys(metadata).length > 0) {
      try {
        const safeMeta = sanitizeData(metadata);
        logLine += ` | Data: ${JSON.stringify(safeMeta)}`;
      } catch {}
    }

    if (error) {
      const errMsg = error?.stack || error?.message || String(error);
      logLine += `\n  Error: ${errMsg}`;
    }

    logLine += '\n';

    // Output to console
    if (level === 'ERROR') {
      console.error(logLine.trim());
    } else if (level === 'WARN') {
      console.warn(logLine.trim());
    } else {
      console.log(logLine.trim());
    }

    // In cloud / serverless environment (Netlify, Vercel, Lambda) or console-only mode
    const isCloudOrServerless =
      (process.env.DEPLOYMENT_MODE || '').toLowerCase().trim() === 'cloud' ||
      (process.env.DATABASE_DRIVER || '').toLowerCase().trim() === 'postgres' ||
      Boolean(process.env.NETLIFY) ||
      Boolean(process.env.VERCEL) ||
      Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
      process.env.LOG_TO_CONSOLE === 'true' ||
      process.env.SALEFLOW_LOG_CONSOLE === 'true';

    if (isCloudOrServerless) {
      return;
    }

    // Persist to saleflow.log for on-premise and hostinger if directory writable
    try {
      const file = this.getLogFile();
      const parent = path.dirname(file);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.appendFileSync(file, logLine, 'utf8');
    } catch {}
  }

  public info(category: string, message: string, metadata?: LogMetadata) {
    this.writeToFile('INFO', category, message, metadata);
  }

  public warn(category: string, message: string, metadata?: LogMetadata) {
    this.writeToFile('WARN', category, message, metadata);
  }

  public error(category: string, message: string, error?: any, metadata?: LogMetadata) {
    this.writeToFile('ERROR', category, message, metadata, error);
  }
}

export const appLog = new AppLogger();
