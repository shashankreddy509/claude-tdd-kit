// Pure matcher + masker over ~/.claude/secret-patterns.json (other local tools may read the same file).
// Never returns or logs a matched value: callers get kinds and masked text only.
export type SecretPattern = { kind: string; pattern: string; flags?: string }
export type Compiled = { kind: string; re: RegExp }[]

export function compile(list: unknown): Compiled {
  if (!Array.isArray(list) || !list.length) throw new Error('secret-patterns.json: expected a non-empty array')
  return list.map((p: SecretPattern) => {
    if (typeof p?.kind !== 'string' || typeof p.pattern !== 'string') throw new Error('secret-patterns.json: entry needs kind + pattern')
    const flags = (p.flags ?? '').includes('g') ? p.flags! : `${p.flags ?? ''}g`
    return { kind: p.kind, re: new RegExp(p.pattern, flags) }
  })
}

// One kind per hit, in pattern order, plus the masked text. Masking as it goes keeps a generic
// pattern from re-hitting what a specific one already caught.
export function scan(text: string, patterns: Compiled): { kinds: string[]; masked: string } {
  const kinds: string[] = []
  const masked = patterns.reduce((s, { kind, re }) => s.replace(re, () => (kinds.push(kind), `[REDACTED:${kind}]`)), text)
  return { kinds, masked }
}
