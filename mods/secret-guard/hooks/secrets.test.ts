import { expect, mock, test } from 'claude-code/testing'

import { compile } from './secrets'

// The guard flow through the real register.tsx. Patterns come from a two-kind FAKE fixture because
// the test kit cannot read ~/.claude/secret-patterns.json; check-patterns.mjs covers that file.
const FIXTURE = [
  { kind: 'telegram-token', pattern: '(?<!\\d)\\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])', flags: 'g' },
  { kind: 'key-value-secret', pattern: '\\b(?:token|password)\\s*[=:]\\s*[A-Za-z0-9._/+-]{12,}', flags: 'gi' },
]
const TG = `${'1'.repeat(9)}:${'Ab'.repeat(17)}c`
const KV = `password=${'x'.repeat(14)}`

async function submit($: any, on: any, text: string, answer: string, file = JSON.stringify(FIXTURE)) {
  const asked: string[] = []
  const filled: string[] = []
  let sent: string | undefined
  mock.env(on, { HOME: '/home/test' })
  on('fs.read', async () => ({ value: file }))
  on('prompt.fill', async (_: any, e: any) => (filled.push(e.text), { isFilled: true }))
  on('tool.call', { tool: 'AskUserQuestion' }, async (_: any, e: any) => {
    const q = e.questions[0].question
    asked.push(q)
    return { result: { questions: e.questions, answers: { [q]: answer } } }
  })
  on('prompt.submit', async (_: any, e: any) => ((sent = e.text), { text: e.text }))
  const res = await $.prompt.submit({ text })
  return { asked, filled, sent, res }
}

test('Mask sends kinds only, and the dialog never shows a value', async ($, on) => {
  const { asked, sent } = await submit($, on, `a ${TG} b ${KV} c`, 'Mask')
  expect(asked).toEqual(['Secret Guard: 2 possible secret(s) (telegram-token, key-value-secret). What now?'])
  expect(sent).toBe('a [REDACTED:telegram-token] b [REDACTED:key-value-secret] c')
})

test('Send anyway sends unchanged', async ($, on) => {
  expect((await submit($, on, `a ${TG}`, 'Send anyway')).sent).toBe(`a ${TG}`)
})

test('Cancel drops and puts the text back', async ($, on) => {
  const { sent, filled, res } = await submit($, on, `a ${TG}`, 'Cancel')
  expect(sent).toBe(undefined)
  expect(filled).toEqual([`a ${TG}`])
  expect(typeof (res as any).drop).toBe('string')
})

test('clean text passes with no dialog', async ($, on) => {
  const { asked, sent } = await submit($, on, 'build the next mods now', 'Mask')
  expect(asked.length).toBe(0)
  expect(sent).toBe('build the next mods now')
})

test('a broken pattern file holds the prompt (fail closed)', async ($, on) => {
  const { sent, filled, res } = await submit($, on, 'anything', 'Mask', '[]')
  expect(sent).toBe(undefined)
  expect(filled).toEqual(['anything'])
  expect(String((res as any).drop)).toContain('Secret Guard error')
})

test('compile rejects malformed entries', async () => {
  expect(() => compile([{ pattern: 'x' }])).toThrow()
})
