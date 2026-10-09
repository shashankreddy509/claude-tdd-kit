import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Choice } from '../types'
import { compile, scan } from './secrets'

const off = atom({ plugin: 'secret-guard', key: 'off' } as const, false)
const CHOICES: Choice[] = ['Mask', 'Send anyway', 'Cancel']

// Read per prompt so an edit to the shared file applies at once.
async function loadPatterns($: EngineInterface) {
  return compile(JSON.parse(await $.fs.read(`${await $.env.get('HOME')}/.claude/secret-patterns.json`)))
}

// Drop the prompt and put the typed text back so nothing is lost.
// A failed refill must never turn a hold into a send.
async function hold($: EngineInterface, text: string, reason: string) {
  try {
    await $.prompt.fill({ text })
  } catch {}
  return { drop: reason }
}

async function ask($: EngineInterface, found: string[]) {
  const kinds = [...new Set(found)].join(', ')
  try {
    return await $.ui.ask(`Secret Guard: ${found.length} possible secret(s) (${kinds}). What now?`, CHOICES)
  } catch {
    return 'Cancel' // dismissed
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'secretguard', description: 'Secret Guard: check prompts for secrets (this session)', argumentHint: 'on|off' })
    return next(e)
  })

  on('command.run', { command: 'secretguard' }, async ($, e) => {
    const word = e.args.trim()
    if (word !== 'on' && word !== 'off') return { text: `Usage: /secretguard on|off (now ${(await read($, off)) ? 'off' : 'on'})` }
    await update($, off, () => word === 'off')
    return { text: `Secret Guard ${word}` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (await read($, off)) return next(e)
    const { kinds, masked } = scan(e.text, await loadPatterns($))
    if (!kinds.length) return next(e)
    const choice = await ask($, kinds)
    if (choice === 'Mask') return next({ ...e, text: masked })
    if (choice === 'Send anyway') return next(e)
    return hold($, e.text, 'Secret Guard: cancelled') // Cancel, dismiss, or free text
  }).catch(($, e, next) =>
    next.called ? next(e) : hold($, e.text, `Secret Guard error: ${next.error.message ?? next.error.kind}. /secretguard off to resend`))
}
