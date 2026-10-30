/**
 * Mask secrets in strings so findings never echo full credentials.
 */

const MASK = '••••••••';

/** Patterns that look like secrets (value capture group used for masking). */
const VALUE_PATTERNS: RegExp[] = [
  // Assignment-style: KEY = "value" or KEY: "value"
  /((?:api[_-]?key|apikey|secret|password|passwd|pwd|token|auth[_-]?token|access[_-]?token|private[_-]?key|client[_-]?secret|aws[_-]?secret)\s*[=:]\s*["']?)([^\s"']{8,})/gi,
  // Bearer tokens
  /(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi,
  // AWS access key id
  /(AKIA[0-9A-Z]{16})/g,
  // Generic long secrets in quotes after sensitive keys already handled above;
  // JWT-like
  /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g,
  // Private key headers — mask the whole block start
  /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)([\s\S]*?)(-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi,
];

export function maskSecrets(text: string): string {
  if (!text) {
    return text;
  }
  let result = text;
  for (const re of VALUE_PATTERNS) {
    result = result.replace(re, (...args: unknown[]) => {
      const match = String(args[0]);
      // Private key triple-group form
      if (match.includes('PRIVATE KEY')) {
        const begin = String(args[1] ?? '');
        const end = String(args[3] ?? '');
        return `${begin}\n${MASK}\n${end}`;
      }
      // Two-group (prefix + value) or single-group
      if (args.length >= 3 && typeof args[1] === 'string' && typeof args[2] === 'string') {
        const prefix = args[1] as string;
        const value = args[2] as string;
        if (value.length >= 8) {
          return prefix + maskValue(value);
        }
      }
      // Single capture (AWS key, JWT)
      if (typeof args[1] === 'string' && (args[1] as string).length >= 16) {
        return maskValue(args[1] as string);
      }
      return MASK;
    });
  }
  return result;
}

export function maskValue(value: string): string {
  if (value.length <= 8) {
    return MASK;
  }
  const start = value.slice(0, 4);
  const end = value.slice(-2);
  return `${start}${MASK}${end}`;
}

export function findingId(
  checkId: string,
  filePath: string | undefined,
  line: number | undefined,
  title: string
): string {
  const parts = [checkId, filePath ?? '', String(line ?? ''), title];
  return Buffer.from(parts.join('|')).toString('base64url').slice(0, 48);
}
