import type { ProcessRunResult } from 'claude-code'

import type { Head, Ship, ShipItem } from '../types'

// The pipeline's record of the last verified run (tdd-pipeline build-coordinator writes it; never this mod).
export type Receipt = {
  sha?: string
  tree?: string
  stage?: string
  red?: { exit?: number | null; note?: string }
  green?: { exit?: number | null }
  review?: { critical?: number; must_fix?: number; warnings?: number; unverified?: number }
  gating?: { required?: string[]; seeded?: string[]; readback?: string }
}

const DIR = 'tasks/receipts'
const KEY = /[A-Z][A-Z0-9]+-\d+/gi
const SHA = /^[0-9a-f]{7,64}$/
export const READY = 'ready to /ship'

export function parse(text: string): Receipt | undefined {
  try {
    const r: unknown = JSON.parse(text)
    return r && typeof r === 'object' && !Array.isArray(r) ? (r as Receipt) : undefined
  } catch {
    return undefined
  }
}

// What /ship would refuse right now. Source of every rule and its order: tdd-pipeline/commands/ship.md
// step 0 (the receipt gate table, then Staleness). Change a rule there, change it here and its fixture.
// `head` undefined = HEAD unreadable, so no staleness item; `since` = commits after receipt.sha, when known.
export function items(r: Receipt | undefined, head: string | undefined, since?: number): ShipItem[] {
  if (!r) return [{ level: 'stop', text: 'receipt unreadable' }]
  const out: ShipItem[] = []
  const stop = (text: string) => out.push({ level: 'stop', text })
  if (r.stage !== 'complete') stop(`stopped at ${r.stage ?? 'no stage'}`)
  const redOk = r.red?.exit !== 0 && !(r.red?.exit == null && !r.red?.note)
  if (!redOk) stop(r.red?.exit === 0 ? 'tests never failed' : 'no red run recorded')
  if (r.green?.exit !== 0) stop('tests are red')
  if (redOk && r.green?.exit === 0) out.push({ level: 'ok', text: 'tests red→green' })
  const review = r.review ?? {}
  const blockers = (['critical', 'must_fix', 'unverified'] as const).filter(k => (review[k] ?? 0) > 0)
  if (blockers.length) stop(`review: ${blockers.map(k => `${review[k]} ${k.replace('_', '-')}`).join(' · ')}`)
  else out.push({ level: 'ok', text: 'review' })
  const g = r.gating
  if (g && (g.readback !== 'ok' || (g.required ?? []).some(k => !(g.seeded ?? []).includes(k)))) stop('kill-switch missing')
  if ((review.warnings ?? 0) > 0) out.push({ level: 'warn', text: `${review.warnings} warning${review.warnings === 1 ? '' : 's'}` })
  if (head && r.sha !== head) {
    const count = since === undefined ? '' : ` (${since} commit${since === 1 ? '' : 's'} since)`
    stop(`receipt stale${count}`)
  }
  // The tree fingerprint needs git and ship.md's own command; the band never computes it, never shows it as ✓.
  const edits: ShipItem[] = r.tree ? [{ level: 'muted', text: 'edits checked at /ship' }] : []
  const clear = out.every(i => i.level === 'ok')
  return [...(clear ? [{ level: 'ok', text: READY } as const] : out), ...edits]
}

// The repo as the band reads it. register.tsx wires these to $.fs and $.process: a mod's $ never crosses an import.
export type Repo = {
  read: (path: string) => Promise<string>
  run: (argv: string[]) => Promise<ProcessRunResult>
}

const readText = (repo: Repo, path: string) => repo.read(path).then(t => t.trim(), () => undefined)

// HEAD and branch from the repo files, no shell: `.git` is a dir, or a file `gitdir: <path>` in a worktree,
// whose refs live in the `commondir` it names; a ref not loose is in packed-refs.
// `worktree`: `.git` is that file (the header's "⑂ wt").
export type HeadInfo = Head & { head?: string }
export async function readHead(repo: Repo): Promise<HeadInfo> {
  const linked = (await readText(repo, '.git'))?.match(/^gitdir: (.+)$/m)?.[1]
  const gitdir = linked ?? '.git'
  const worktree = linked !== undefined
  const head = await readText(repo, `${gitdir}/HEAD`)
  const ref = head?.match(/^ref: (\S+)/)?.[1]
  if (!ref) return { head, worktree }
  const branch = ref.replace(/^refs\/heads\//, '')
  const commondir = await readText(repo, `${gitdir}/commondir`)
  let common = gitdir
  if (commondir) common = commondir.startsWith('/') ? commondir : `${gitdir}/${commondir}`
  const packed = async () => (await readText(repo, `${common}/packed-refs`))?.split('\n').find(l => l.endsWith(` ${ref}`))?.split(' ')[0]
  return { head: (await readText(repo, `${gitdir}/${ref}`)) ?? (await readText(repo, `${common}/${ref}`)) ?? (await packed()), branch, worktree }
}

// Only a receipt whose ticket key the branch names: none on main, a detached HEAD or a branch without a key,
// so a shipped ticket's old receipt never shows as stale forever.
export async function pickReceipt(repo: Repo, branch = ''): Promise<{ key: string; text: string } | undefined> {
  for (const key of (branch.match(KEY) ?? []).map(k => k.toUpperCase())) {
    const text = await repo.read(`${DIR}/${key}.json`).catch(() => undefined)
    if (text !== undefined) return { key, text }
  }
  return undefined
}

// Read-only count of commits after the receipt's sha; undefined on any failure (no git, desktop, bad sha).
async function commitsSince(repo: Repo, sha: string | undefined): Promise<number | undefined> {
  if (!sha || !SHA.test(sha)) return undefined
  const run = await repo.run(['git', 'rev-list', '--count', `${sha}..HEAD`]).catch(() => undefined)
  const n = run?.exitCode === 0 ? Number(run.stdout.trim()) : NaN
  return Number.isInteger(n) ? n : undefined
}

// `at`: the HEAD the caller already read (the pane's header reads it too), else read here.
export async function shipState(repo: Repo, at?: HeadInfo): Promise<Ship | null> {
  const { head, branch } = at ?? (await readHead(repo))
  const pick = await pickReceipt(repo, branch)
  if (!pick) return null
  const r = parse(pick.text)
  const since = r && head && r.sha !== head ? await commitsSince(repo, r.sha) : undefined
  return { key: pick.key, items: items(r, head, since) }
}
