import { expect, test } from 'claude-code/testing'

import type { Agent } from '../types'
import { STAGE, agentsLook, buildOf, initials, rail, tree } from './rail'

const K = 'tdd-pipeline:'
let at = 0
const agent = (id: string, type: string, status: string, parent?: string, extra: Partial<Agent> = {}): Agent => ({
  id, type, status, description: '', model: 'claude-sonnet-5-5', from: ++at, elapsed: '0:10', effort: '', tokens: 0, usd: 0.1, ...(parent ? { parent } : {}), ...extra,
})

test('stage map: pinned to the kit agent names (owner ruled 2026-10-13), full types only', () => {
  expect(STAGE).toEqual({
    Explore: 'explore',
    [`${K}planner`]: 'explore',
    [`${K}test-writer`]: 'tests',
    [`${K}implementer`]: 'code',
    [`${K}test-runner`]: 'run',
    [`${K}code-review-coordinator`]: 'review',
    [`${K}security-reviewer`]: 'review',
    [`${K}code-quality-reviewer`]: 'review',
    [`${K}memory-analyzer`]: 'review',
    [`${K}money-logic-reviewer`]: 'review',
    [`${K}concurrency-reviewer`]: 'review',
    [`${K}kotlin-best-practices`]: 'review',
  })
  expect(STAGE['test-writer']).toBeUndefined() // a user's own same-named agent is not the kit's
})

test('rail: the newest staged agent is the stage, earlier ones done; build-coordinator alone has no stage yet', () => {
  const states = (b: Agent[]) => rail(b).map(s => `${s.label}:${s.state}`).join(' ')
  const bc = agent('bc', `${K}build-coordinator`, 'running')
  expect(states([bc])).toBe('explore:todo tests:todo code:todo run:todo review:todo')
  const tw = agent('tw', `${K}test-writer`, 'completed', 'bc')
  expect(states([bc, tw])).toBe('explore:done tests:now code:todo run:todo review:todo')
  const rv = agent('rv', `${K}security-reviewer`, 'running', 'cr')
  expect(states([bc, tw, rv])).toBe('explore:done tests:done code:done run:done review:now')
})

test('rail: each test-runner spawn is a round; the fix loop shows run r2, r3', () => {
  const bc = agent('bc', `${K}build-coordinator`, 'running')
  const runs = (n: number) => Array.from({ length: n }, (_, i) => [agent(`im${i}`, `${K}implementer`, 'completed', 'bc'), agent(`tr${i}`, `${K}test-runner`, 'completed', 'bc')]).flat()
  expect(rail([bc, ...runs(1)]).find(s => s.stage === 'run')?.label).toBe('run')
  expect(rail([bc, ...runs(2)]).find(s => s.stage === 'run')).toEqual({ stage: 'run', label: 'run r2', state: 'now' })
  const fixing = [bc, ...runs(3), agent('im9', `${K}implementer`, 'running', 'bc')]
  expect(rail(fixing).map(s => `${s.label}:${s.state}`)).toEqual(['explore:done', 'tests:done', 'code:now', 'run r3:todo', 'review:todo'])
})

test('tree: depth first, oldest first, box-drawing leads and pads', () => {
  const bc = agent('bc', `${K}build-coordinator`, 'running')
  const tw = agent('tw', `${K}test-writer`, 'running', 'bc')
  const cr = agent('cr', `${K}code-review-coordinator`, 'running', 'bc')
  const sr = agent('sr', `${K}security-reviewer`, 'running', 'cr')
  const all = [bc, tw, cr, sr]
  expect(tree(all, [bc]).map(r => [r.agent.id, r.lead, r.pad])).toEqual([
    ['bc', '', ''],
    ['tw', '├─ ', '│  '],
    ['cr', '└─ ', '   '],
    ['sr', '   └─ ', '      '],
  ])
})

test('look: the newest live build gets the rail, its reviewers (grandchildren) included; other live tops are a plain tree', () => {
  const old = agent('b1', `${K}build-coordinator`, 'running', undefined, { description: 'Run TDD pipeline OLD-1' })
  const bc = agent('b2', `${K}build-coordinator`, 'running', undefined, { description: 'Run TDD pipeline TDESK-15', elapsed: '4:42' })
  const cr = agent('cr', `${K}code-review-coordinator`, 'completed', 'b2')
  const sr = agent('sr', `${K}security-reviewer`, 'running', 'cr')
  const ex = agent('ex', 'Explore', 'running')
  const gone = agent('gp', 'general-purpose', 'completed')
  const all = [old, bc, cr, sr, ex, gone]
  expect(buildOf(all)).toBe(bc)
  const look = agentsLook(all)
  expect(look.rows.map(r => r.agent.id)).toEqual(['b2', 'cr', 'sr', 'b1', 'ex'])
  expect(look.stages.find(s => s.state === 'now')?.stage).toBe('review')
  expect(look.title).toBe('TDESK-15 · 4:42 · ≈$0.50')
})

test('look: no kit agent live is a plain tree titled by the running count; nothing live is empty', () => {
  const ex = agent('ex', 'Explore', 'running')
  const gp = agent('gp', 'general-purpose', 'running', 'ex')
  const look = agentsLook([ex, gp, agent('pl', `${K}planner`, 'completed')])
  expect(look.stages).toEqual([])
  expect(look.rows.map(r => r.agent.id)).toEqual(['ex', 'gp'])
  expect(look.title).toBe('2 running · ≈$0.20')
  expect(agentsLook([agent('z', 'Explore', 'completed')])).toEqual({ title: '', stages: [], rows: [] })
})

test('initials: two letters per agent, from its words', () => {
  expect([`${K}build-coordinator`, 'Explore', 'general-purpose', `${K}code-review-coordinator`].map(initials)).toEqual(['BC', 'EX', 'GP', 'CR'])
})
