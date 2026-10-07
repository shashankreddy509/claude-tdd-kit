// Pure logic for the "Left undone" card: TODOs and skipped tests written into files, and lines in the
// model's reply that admit something was not done.
import type { Undone } from '../types'

export const MAX_UNDONE = 9
export const KEYS = 'abcdefghi'

const TODO_RE = /\b(TODO|FIXME)\b|\.skip\(|\bx(it|describe)\(|@pytest\.mark\.skip|@Ignore\b/
const SAID_RE =
  /\b(did not|didn't|have not|haven't) (run|test|verify|check|finish|do|get to)|\bnot (yet|tested|verified|proven|run)\b|\bstill (open|pending|untested|todo)\b|\bleft (undone|open)\b|\bskipped\b/i

const squash = (s: string) => s.trim().replace(/^[-*>\d.)\s]+/, '').replace(/\s+/g, ' ')
const base = (path: string) => path.split('/').pop() ?? path

// Lines added by a write that carry a TODO or a skipped test; lines already in `before` were not added now.
export function fileTodos(path: string, after: string, before = ''): string[] {
  const old = new Set(before.split('\n').map(l => l.trim()))
  return after
    .split('\n')
    .filter(l => TODO_RE.test(l) && !old.has(l.trim()))
    .map(l => `${base(path)}: ${squash(l)}`)
}

// Reply lines (bullets or sentences) that say something was left undone; code blocks skipped.
export function saidUndone(answer: string): string[] {
  const prose = answer.replace(/```[\s\S]*?```/g, '')
  return prose
    .split(/\n|(?<=[.!?])\s+/)
    .map(squash)
    .filter(l => l.length > 8 && SAID_RE.test(l))
}

// New entries go on top, a repeat of an open entry is dropped, the list stays at MAX_UNDONE.
export function addUndone(list: readonly Undone[], source: Undone['source'], texts: string[]): Undone[] {
  const seen = new Set(list.map(u => u.text))
  const fresh = [...new Set(texts)].filter(t => !seen.has(t)).map(text => ({ source, text }))
  return [...fresh, ...list].slice(0, MAX_UNDONE)
}

export const doItNow = (u: Undone) => `You left this undone: ${u.text} Do it now.`
