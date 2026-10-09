// Pure logic for the "Left undone" card: TODOs and skipped tests written into files. Reply lines are not
// scanned: report headings ("Skipped:", "Not proven yet") filled the card with noise (owner ruled 2026-10-09).
import type { Undone } from '../types'

export const MAX_UNDONE = 9
export const KEYS = 'abcdefghi'

// Skip markers: JS (.skip, xit), pytest, JUnit 4/5, Go t.Skip, Rust #[ignore], Swift XCTSkip / .disabled(.
const TODO_RE =
  /\b(TODO|FIXME)\b|\.skip\(|\bx(it|describe)\(|@pytest\.mark\.skip|@Ignore\b|@Disabled\b|\bt\.Skip(?:f|Now)?\(|#\[ignore\]|\bXCTSkip\b|\.disabled\(/

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

// New entries go on top, a repeat of an open entry is dropped, the list stays at MAX_UNDONE.
export function addUndone(list: readonly Undone[], texts: string[]): Undone[] {
  const seen = new Set(list.map(u => u.text))
  const fresh = [...new Set(texts)].filter(t => !seen.has(t)).map(text => ({ text }))
  return [...fresh, ...list].slice(0, MAX_UNDONE)
}

export const doItNow = (u: Undone) => `You left this undone: ${u.text} Do it now.`
