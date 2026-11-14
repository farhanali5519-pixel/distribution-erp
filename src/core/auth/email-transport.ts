import tls from 'node:tls';
import net from 'node:net';
import { appLog } from '@/core/logging/logger';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isTestMode?: boolean;
}

// In-memory buffer of last sent test OTPs (used for testing and dev inspection)
const testEmailOutbox: Array<{ to: string; subject: string; text: string; timestamp: number }> = [];

export function getLatestTestEmailFor(email: string) {
  const clean = email.toLowerCase().trim();
  return testEmailOutbox.filter((m) => m.to.toLowerCase() === clean).pop() || null;
}

export function clearTestEmailOutbox() {
  testEmailOutbox.length = 0;
}

/**
 * Sends transactional email via SMTP if configured in environment variables,
 * or safely falls back to test outbox / logging without throwing errors.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT?.trim() || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || 'no-reply@salesflow.space';

  // 1. If SMTP is not fully configured, record in test outbox and return success
  if (!host || !user || !pass) {
    appLog.info('EMAIL_TRANSPORT', `[TEST MODE] Outbound email to <${options.to}>: ${options.subject}`);
    testEmailOutbox.push({
      to: options.to,
      subject: options.subject,
      text: options.text,
      timestamp: Date.now(),
    });
    // Keep max 50 in buffer
    if (testEmailOutbox.length > 50) testEmailOutbox.shift();
    return {
      success: true,
      messageId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      isTestMode: true,
    };
  }

  // 2. Production SMTP Client using Node.js built-in tls/net sockets
  return new Promise<EmailSendResult>((resolve) => {
    let socket: net.Socket;
    const isImplicitTls = port === 465;

    const cleanup = () => {
      try {
        if (!socket.destroyed) socket.destroy();
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ success: false, error: 'SMTP connection timeout after 15000ms' });
    }, 15000);

    try {
      if (isImplicitTls) {
        socket = tls.connect({ host, port, servername: host }, onConnect);
      } else {
        socket = net.connect({ host, port }, onConnect);
      }
    } catch (err: any) {
      clearTimeout(timeout);
      return resolve({ success: false, error: err?.message || 'Failed to initialize socket' });
    }

    let step = 0;
    let buffer = '';

    function onConnect() {
      // Waiting for greeting (220)
    }

    socket.on('error', (err) => {
      clearTimeout(timeout);
      cleanup();
      appLog.error('EMAIL_TRANSPORT', `SMTP Socket Error: ${err.message}`, err);
      resolve({ success: false, error: err.message });
    });

    socket.on('data', (data) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (isNaN(code)) continue;
        if (line.charAt(3) === '-') continue; // Multi-line response continuation

        try {
          if (step === 0 && code === 220) {
            // Send EHLO
            step = 1;
            socket.write(`EHLO ${host}\r\n`);
          } else if (step === 1 && code === 250) {
            // Check AUTH
            step = 2;
            socket.write('AUTH LOGIN\r\n');
          } else if (step === 2 && code === 334) {
            // Send Base64 Username
            step = 3;
            socket.write(Buffer.from(user!).toString('base64') + '\r\n');
          } else if (step === 3 && code === 334) {
            // Send Base64 Password
            step = 4;
            socket.write(Buffer.from(pass!).toString('base64') + '\r\n');
          } else if (step === 4 && code === 235) {
            // Authenticated! Send MAIL FROM
            step = 5;
            socket.write(`MAIL FROM:<${from}>\r\n`);
          } else if (step === 5 && code === 250) {
            // Send RCPT TO
            step = 6;
            socket.write(`RCPT TO:<${options.to}>\r\n`);
          } else if (step === 6 && code === 250) {
            // Send DATA
            step = 7;
            socket.write('DATA\r\n');
          } else if (step === 7 && code === 354) {
            // Send Message Body
            step = 8;
            const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`;
            const raw = [
              `From: ${from}`,
              `To: ${options.to}`,
              `Subject: ${options.subject}`,
              `Message-ID: ${msgId}`,
              'MIME-Version: 1.0',
              options.html
                ? 'Content-Type: text/html; charset=UTF-8'
                : 'Content-Type: text/plain; charset=UTF-8',
              '',
              options.html || options.text,
              '.\r\n',
            ].join('\r\n');
            socket.write(raw);
          } else if (step === 8 && code === 250) {
            // Sent! Send QUIT
            step = 9;
            socket.write('QUIT\r\n');
            clearTimeout(timeout);
            cleanup();
            resolve({ success: true, messageId: `smtp-${Date.now()}` });
          } else if (code >= 400) {
            clearTimeout(timeout);
            cleanup();
            resolve({ success: false, error: `SMTP Rejected (${code}): ${line}` });
          }
        } catch (stepErr: any) {
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: stepErr?.message || 'Error during SMTP exchange' });
        }
      }
    });
  });
}
