import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Pending } from '../types'
import { cacheState, eatingText, filled, kTokens, warmthSvg } from './cache'

// This session's prompt cache lives 1h; `/cachekeeper ttl <min>` overrides it for testing.
const DEFAULT_TTL_MIN = 60
const TICK_MS = 15_000
const WARMTH_CELLS = 10

const lastAt = atom({ plugin: 'cache-keeper', key: 'lastAt' } as const, null)
const model = atom({ plugin: 'cache-keeper', key: 'model' } as const, null)
const ttlMin = atom({ plugin: 'cache-keeper', key: 'ttlMin' } as const, DEFAULT_TTL_MIN)
const tick = atom({ plugin: 'cache-keeper', key: 'tick' } as const, 0)
const warnedFor = atom({ plugin: 'cache-keeper', key: 'warnedFor' } as const, null)
const pending = atom({ plugin: 'cache-keeper', key: 'pending' } as const, null)
const eating = atom({ plugin: 'cache-keeper', key: 'eating' } as const, '')
// `/cachekeeper off` hides the band for this session; `/cachekeeper on` shows it again.
const hidden = atom({ plugin: 'cache-keeper', key: 'hidden' } as const, false)

// Local estimate only (`summary` sends no requests); refreshed once per main-loop turn, not per draw.
async function measureEating($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  if (context.breakdown) await update($, eating, () => eatingText(context.breakdown!.categories))
}

// '[1m]'-style suffixes name a context window, not a different price list entry.
// ponytail: one $/token per model, learned at whatever context size the runtime priced; long-context tiers blur.
const baseModel = (m: string) => m.replace(/\[.*\]$/, '')
const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: 'week' }

async function rates($: EngineInterface) {
  return ((await $.store.get('rates')) ?? {}) as Record<string, number>
}

// The runtime prices a cache rewrite only on a resume and a model switch: keep its $/token per model.
async function learnRate($: EngineInterface, m: string | undefined, usd: number | undefined, tokens: number | undefined) {
  if (!m || !usd || !tokens) return
  await $.store.set('rates', { ...(await rates($)), [baseModel(m)]: usd / tokens })
}

async function handoff($: EngineInterface, mode: Exclude<Pending, null>) {
  if ((await read($, pending)) !== null) return
  await update($, pending, () => mode)
  await $.command.run({ command: 'dev-day:end-session' })
}

async function finishHandoff($: EngineInterface) {
  const mode = await read($, pending)
  await update($, pending, () => null)
  await $.command.run({ command: 'clear' })
  if (mode === 'start') await $.command.run({ command: 'dev-day:start-session' })
}

async function onTick($: EngineInterface) {
  const now = await $.clock.now()
  await update($, tick, () => now)
  const last = await read($, lastAt)
  const s = cacheState(last, now, (await read($, ttlMin)) * 60_000, await read($, warnedFor))
  if (s?.shouldWarn) {
    await update($, warnedFor, () => last)
    $.ui.toast(`Cache goes cold in ${Math.ceil(s.msLeft / 60_000)}m. ctrl+x tab, then h handoff / s handoff+start`, { timeoutMs: 15_000 })
  }
}

function limitsText(limits: SessionRateLimit[]) {
  return limits
    .filter(l => LIMIT_NAMES[l.kind])
    .map(l => `${LIMIT_NAMES[l.kind]} ${Math.round(l.percentUsed)}%`)
    .join(' · ')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cachekeeper', description: 'Cache Keeper: hide/show the band for this session, or set the cache TTL', argumentHint: 'on | off | ttl <minutes>' })
    $.clock.every(TICK_MS, () => void onTick($))
    await onTick($)
    return next(e)
  })

  on('command.run', { command: 'cachekeeper' }, async ($, e) => {
    const [word, value] = e.args.trim().split(/\s+/)
    if (word === 'on' || word === 'off') {
      await update($, hidden, () => word === 'off')
      return { text: `Cache Keeper ${word} for this session` }
    }
    const minutes = Number(value ?? DEFAULT_TTL_MIN)
    if (word !== 'ttl' || !(minutes > 0)) return { text: 'Usage: /cachekeeper on | off | ttl <minutes> (no number resets to 60)' }
    await update($, ttlMin, () => minutes)
    await onTick($)
    return { text: `Cache Keeper TTL set to ${minutes}m` }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    if (e.usage) {
      const now = await $.clock.now()
      await update($, lastAt, () => now)
      await update($, model, () => e.usage!.model)
      await onTick($)
    }
    void measureEating($).catch(() => undefined)
    if ((await read($, pending)) !== null) {
      if (e.reason === 'answer') {
        // /clear cannot run inside a hook the turn is waiting on.
        $.clock.after(0, () => void finishHandoff($))
      } else {
        await update($, pending, () => null)
        $.ui.toast('Handoff stopped: end-session did not finish')
      }
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, lastAt, () => null)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await learnRate($, e.model, e.estimated_cache_write_usd, e.context_tokens)
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await learnRate($, e.to_model, e.estimated_cache_write_usd, e.context_tokens)
    return next(e)
  })

  // Draw whatever the plugins beneath draw too (Next Steps' row), under this one.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || (await read($, hidden))) return below
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    await read($, tick)
    const last = await read($, lastAt)
    const s = cacheState(last, await $.clock.now(), (await read($, ttlMin)) * 60_000, null)
    const { context, rateLimits, cost } = await $.session.usage()
    const m = await read($, model)
    const rate = m ? (await rates($))[baseModel(m)] : undefined
    const busy = (await read($, pending)) !== null
    const eats = await read($, eating)

    const left = s && (s.msLeft >= 120_000 ? `${Math.floor(s.msLeft / 60_000)}m` : `${Math.ceil(s.msLeft / 1000)}s`)
    const parts = [
      context.tokens ? `ctx ${kTokens(context.tokens)}` : '',
      context.tokens ? `rewrite ≈ ${rate ? `$${(context.tokens * rate).toFixed(2)}` : '$?'}` : '',
      limitsText(rateLimits),
      cost ? `session $${cost.usd.toFixed(2)}` : '',
    ].filter(Boolean)

    return (
      <Box flexDirection="column">
        <Box columnGap={1} alignItems="center">
          {s === null ? (
            <Text dimColor>○ no cache yet</Text>
          ) : (
            <Text bold color={s.tone}>{`● cache ${s.warm ? `warm ${left}` : 'cold'}`}</Text>
          )}
          {s === null ? null : e.surface !== 'terminal' && 'Svg' in ui ? (
            <ui.Svg source={warmthSvg(s.left, s.tone)} alt={`cache ${Math.round(s.left * 100)}% warm`} />
          ) : (
            <Box key="warmth">
              <Text color={s.tone}>{'━'.repeat(filled(s.left, WARMTH_CELLS))}</Text>
              <Text color="subtle">{'━'.repeat(WARMTH_CELLS - filled(s.left, WARMTH_CELLS))}</Text>
            </Box>
          )}
          <Text dimColor>{parts.map(p => `| ${p}`).join(' ')}</Text>
          {busy ? (
            <Text dimColor>handoff running…</Text>
          ) : (
            <Box>
              <Button key="handoff" variant="primary" label="handoff" hotkey="h" onPress={() => handoff($, 'handoff')} />
              <Button key="start" label="handoff+start" hotkey="s" onPress={() => handoff($, 'start')} />
            </Box>
          )}
        </Box>
        {eats ? <Text dimColor wrap="truncate-end">{`eating: ${eats}`}</Text> : null}
        {below}
      </Box>
    )
  })
}
