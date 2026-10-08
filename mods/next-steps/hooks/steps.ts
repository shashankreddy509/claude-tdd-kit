// Pure logic: the reply's trailing **Questions** block → answer options, and the reply the picks build.
import type { Question } from '../types'

const BLOCK_RE = /\n\*\*Questions\*\*[ \t]*\n((?:[ \t]*\d+[.)][ \t].*(?:\n|$))+)\s*$/
const YES_NO_RE = /yes\s*\/\s*no|\(yes\b[^)]*\)[^()]*\(no\b/i
const RISKY_RE = /\b(merge|deploy|push|delete|rm|drop|reset|force|publish)\b/i
const TICKET_RE = /^[A-Z][A-Z0-9]*-(\d+)$/
const YES_NO = ['yes', 'no']

export function parseQuestions(reply: string): Question[] {
  const m = BLOCK_RE.exec(`${reply.trimEnd()}\n`)
  if (!m) return []
  return [...m[1]!.matchAll(/^[ \t]*(\d+)[.)][ \t](.*)$/gm)].map(([, n, text]) => ({
    n: Number(n),
    text: text!.trim(),
    options: optionsOf(text!),
  }))
}

const clean = (parts: string[]) =>
  parts.map(p => p.replace(/`/g, '').replace(/\s*=\s*recommended/i, '').replace(/[.?]+$/, '').trim()).filter(Boolean)

// yes/no, "(A / B / C)", or "…: A, B, or C?"; anything else falls back to yes/no.
export function optionsOf(q: string): string[] {
  if (YES_NO_RE.test(q)) return YES_NO
  const slash = [...q.matchAll(/\(([^()]*\/[^()]*)\)/g)].pop()
  if (slash) return clean(slash[1]!.split('/'))
  const tail = /(?::|^)\s*([^:]+?)\?\s*$/.exec(q)?.[1] ?? ''
  if (/\bor\b/.test(tail)) {
    const opts = clean(tail.split(/\s*,\s*(?:or\s+)?|\s+or\s+/))
    if (opts.length >= 2 && opts.length <= 5 && opts.every(o => o.length <= 30)) return opts
  }
  return YES_NO
}

// Opt-in (`ticket_number_only`): PROJ-91 → 91.
export const answerText = (opt: string, numberOnly = false) =>
  (numberOnly ? TICKET_RE.exec(opt)?.[1] : undefined) ?? (/^(yes|no)$/i.test(opt) ? opt.toLowerCase() : opt)

export function buildReply(picks: Record<string, string>, numberOnly = false): string {
  return Object.keys(picks)
    .map(Number)
    .sort((a, b) => a - b)
    .map(n => `${n} ${answerText(picks[n]!, numberOnly)}`)
    .join(' ')
}

export const allYesNo = (qs: Question[]) => qs.length > 0 && qs.every(q => q.options.join() === YES_NO.join())

export const isRisky = (text: string) => RISKY_RE.test(text)

export function cut(label: string, width: number): string {
  return label.length <= width ? label : `${label.slice(0, Math.max(1, width - 1))}…`
}
