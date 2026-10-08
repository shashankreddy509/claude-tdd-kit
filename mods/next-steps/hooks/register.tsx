import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Question } from '../types'
import { allYesNo, buildReply, cut, isRisky, parseQuestions } from './steps'

// Reads the **Questions** block every reply ends with (a numbered list under a bold **Questions** heading):
// tap answers, then send them as one reply, e.g. "1 yes 3 PROJ-91".
const questions = atom({ plugin: 'next-steps', key: 'questions' } as const, null)
const picks = atom({ plugin: 'next-steps', key: 'picks' } as const, {})
// `/nextsteps off` hides the buttons for this session; `/nextsteps on` shows them again.
const hidden = atom({ plugin: 'next-steps', key: 'hidden' } as const, false)

// Digits work straight from an empty prompt box; letters need ctrl+x tab first. So answers take 1-9 and
// 0 sends; yes to all, dismiss and any option past the ninth are click-only (owner ruled 2026-10-07).
const ANSWER_KEYS = 9

async function clear($: EngineInterface) {
  await update($, questions, () => null)
  await update($, picks, () => ({}))
}

async function pick($: EngineInterface, n: number, option: string) {
  await update($, picks, p => ({ ...p, [n]: option }))
}

// A reply answering a risky question (merge, push, deploy…) only fills the box for Enter.
async function send($: EngineInterface, text: string, answered: Question[]) {
  await clear($)
  if (answered.some(q => isRisky(q.text))) await $.prompt.fill({ text })
  else await $.prompt.submit({ text, asUser: true })
}

export const register: Register = (on, options) => {
  const numberOnly = options.ticket_number_only === true

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'nextsteps', description: 'Next Steps: hide or show the answer buttons for this session', argumentHint: 'on | off' })
    return next(e)
  })

  on('command.run', { command: 'nextsteps' }, async ($, e) => {
    const word = e.args.trim()
    if (word !== 'on' && word !== 'off') return { text: 'Usage: /nextsteps on | off' }
    await update($, hidden, () => word === 'off')
    return { text: `Next Steps ${word} for this session` }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const qs = e.reason === 'answer' && !e.isAborted ? parseQuestions(e.answer) : []
    await update($, questions, () => (qs.length ? qs : null))
    await update($, picks, () => ({}))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await clear($)
    return next(e)
  })

  on('prompt.suggest', async ($, e, next) =>
    (await read($, questions)) && !(await read($, hidden)) ? { isShown: false } : next(e),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const qs = await read($, questions)
    if (!qs || e.props.hasSurvey || e.props.isWorking || (await read($, hidden))) return below
    const chosen = await read($, picks)
    const { Box, Button, Text } = $.ui.resolve(e)
    const reply = buildReply(chosen, numberOnly)
    const answered = qs.filter(q => chosen[q.n] !== undefined)
    const textWidth = Math.max(12, e.props.bodyColumns - 8)
    let key = 0
    // One question per line, its options stacked under it as numbered rows (next-steps/docs/ui-reference.md).
    return (
      <Box flexDirection="column">
        <Text bold color="permission">next</Text>
        {qs.map(q => (
          <Box key={`q${q.n}`} flexDirection="column">
            <Box>
              <Text>{'  '}</Text>
              <Text backgroundColor="permission" color="inverseText">{` Q${q.n} `}</Text>
              <Text>{` ${cut(q.text, textWidth)}`}</Text>
            </Box>
            {q.options.map(option => {
              key += 1
              return (
                <Box key={`q${q.n}-${option}`}>
                  <Text>{'      '}</Text>
                  <Button
                    plain
                    key={`opt${key}`}
                    label={`${chosen[q.n] === option ? '✓ ' : ''}${cut(option, textWidth - 6)}`}
                    hotkey={key <= ANSWER_KEYS ? String(key) : undefined}
                    onPress={() => pick($, q.n, option)}
                  />
                </Box>
              )
            })}
          </Box>
        ))}
        <Box>
          <Text>  </Text>
          {reply ? <Button variant="primary" key="send" label={`send "${reply}"${answered.some(q => isRisky(q.text)) ? ' …' : ''}`} hotkey="0" onPress={() => send($, reply, answered)} /> : null}
          {reply ? <Text>   </Text> : null}
          {allYesNo(qs) ? <Button plain key="yes" label="yes to all" onPress={() => send($, 'yes to all', qs)} /> : null}
          {allYesNo(qs) ? <Text>   </Text> : null}
          <Button plain key="dismiss" label="dismiss" onPress={() => clear($)} />
        </Box>
        {below}
      </Box>
    )
  })
}
