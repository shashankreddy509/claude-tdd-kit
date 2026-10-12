// Built-in patterns, used only when ~/.claude/secret-patterns.json is missing, so a fresh install
// still guards every prompt instead of holding them all. A present file always wins.
export const DEFAULT_PATTERNS = [
  { kind: 'private-key', pattern: '-----BEGIN[ A-Z]*PRIVATE KEY-----[\\s\\S]*?-----END[ A-Z]*PRIVATE KEY-----', flags: 'g' },
  { kind: 'jwt', pattern: 'eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{4,}', flags: 'g' },
  { kind: 'anthropic-key', pattern: '\\bsk-ant-[A-Za-z0-9_-]{12,}', flags: 'g' },
  { kind: 'openai-key', pattern: '\\bsk-[A-Za-z0-9]{20,}', flags: 'g' },
  { kind: 'slack-token', pattern: '\\bxox[bpaors]-[A-Za-z0-9-]{10,}', flags: 'g' },
  { kind: 'slack-app-token', pattern: '\\bxapp-[A-Za-z0-9-]{10,}', flags: 'g' },
  { kind: 'github-token', pattern: '\\bgh[posru]_[A-Za-z0-9]{20,}', flags: 'g' },
  { kind: 'github-pat', pattern: '\\bgithub_pat_[A-Za-z0-9_]{20,}', flags: 'g' },
  { kind: 'aws-key', pattern: '\\bAKIA[0-9A-Z]{16}\\b', flags: 'g' },
  { kind: 'google-api-key', pattern: '\\bAIza[0-9A-Za-z_-]{30,}', flags: 'g' },
  { kind: 'bearer-token', pattern: '\\b[Bb]earer\\s+[A-Za-z0-9._-]{16,}', flags: 'g' },
  { kind: 'telegram-token', pattern: '(?<!\\d)\\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])', flags: 'g' },
  { kind: 'gmail-app-password', pattern: '(?<=(?:[Pp]ass(?:word|wd)?|PASS(?:WORD|WD)?)[^\\n]{0,20})\\b[a-z]{4}( ?)[a-z]{4}\\1[a-z]{4}\\1[a-z]{4}\\b', flags: 'g' },
  { kind: 'key-value-secret', pattern: '\\b(?:api[_-]?key|secret|token|password|passwd)\\s*[=:]\\s*[\\"\']?[A-Za-z0-9._/+-]{12,}[\\"\']?', flags: 'gi' },
]
