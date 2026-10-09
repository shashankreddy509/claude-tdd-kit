// Checks the shared ~/.claude/secret-patterns.json (read by this mod and any other local tool that uses it).
// The plugin test kit cannot read outside the mod folder, so this runs under plain node: `node check-patterns.mjs`.
// FAKE values only, built from parts.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const r = (c, n) => c.repeat(n)
const HITS = {
  'private-key': `-----BEGIN RSA PRIVATE KEY-----\n${r('A', 40)}\n-----END RSA PRIVATE KEY-----`,
  jwt: `eyJ${r('a', 10)}.${r('b', 10)}.${r('c', 6)}`,
  'anthropic-key': `sk-ant-${r('x', 20)}`,
  'openai-key': `sk-${r('x', 24)}`,
  'slack-token': `xoxb-${r('1', 12)}`,
  'slack-app-token': `xapp-${r('1', 12)}`,
  'github-token': `ghp_${r('x', 24)}`,
  'github-pat': `github_pat_${r('x', 24)}`,
  'aws-key': `AKIA${r('X', 16)}`,
  'google-api-key': `AIza${r('x', 33)}`,
  'bearer-token': `Bearer ${r('x', 20)}`,
  'telegram-token': `${r('1', 9)}:${r('Ab', 17)}c`,
  'gmail-app-password': `app password is ${r('q', 4)} ${r('w', 4)} ${r('e', 4)} ${r('t', 4)}`,
  'key-value-secret': `api_key=${r('x', 14)}`,
}
const MISSES = {
  'private-key': '-----BEGIN PUBLIC KEY-----',
  jwt: 'eyJshort.x.y',
  'anthropic-key': 'sk-ant-short',
  'openai-key': 'sk-short',
  'slack-token': 'xoxb-1',
  'slack-app-token': 'xapp-1',
  'github-token': 'ghp_short',
  'github-pat': 'github_pat_short',
  'aws-key': 'AKIA123',
  'google-api-key': 'AIzaShort',
  'bearer-token': 'Bearer abc',
  'telegram-token': `${r('1', 9)}:${r('Ab', 15)}`,
  'gmail-app-password': `${r('q', 4)} ${r('w', 4)} ${r('e', 4)} ${r('t', 4)} with no keyword`,
  'key-value-secret': 'token: short',
}

const list = JSON.parse(readFileSync(`${homedir()}/.claude/secret-patterns.json`, 'utf8'))
const kinds = list.map(p => p.kind)
let bad = 0
const fail = msg => (bad++, console.log('FAIL', msg))
for (const k of Object.keys(HITS)) if (!kinds.includes(k)) fail(`${k}: missing from the shared file`)
for (const { kind, pattern, flags } of list) {
  const re = () => new RegExp(pattern, flags)
  if (!(kind in HITS)) fail(`${kind}: no test case`)
  else if (!re().test(HITS[kind])) fail(`${kind}: fake not matched`)
  if (MISSES[kind] && list.some(p => new RegExp(p.pattern, p.flags).test(MISSES[kind]))) fail(`${kind}: near miss matched`)
}
console.log(`${list.length} kinds, ${bad} failures`)
process.exit(bad ? 1 : 0)
