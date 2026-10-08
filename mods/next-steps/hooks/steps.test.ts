import { expect, test } from 'claude-code/testing'

import { allYesNo, answerText, buildReply, optionsOf, parseQuestions } from './steps'

// Question shapes taken from real replies (2,260 questions over 14 days: 80% yes/no, 8% "or", 11% slash).
const REPLY = [
  'Done.',
  '',
  '**Questions**',
  '1. Copy Next Steps now (yes/no)?',
  '2. Which ticket first: PROJ-91, PROJ-38, or PROJ-32?',
  '3. Build ctx bar + agent card only? (Yes / build all four / ctx bar only)',
  '',
].join('\n')

test('parses the trailing Questions block into options', async () => {
  expect(parseQuestions(REPLY).map(q => [q.n, q.options])).toEqual([
    [1, ['yes', 'no']],
    [2, ['PROJ-91', 'PROJ-38', 'PROJ-32']],
    [3, ['Yes', 'build all four', 'ctx bar only']],
  ])
  expect(parseQuestions('**Questions**\n1. Ok (yes/no)?\n\nmore text after')).toEqual([])
  expect(parseQuestions('No questions here.')).toEqual([])
})

test('option shapes and the yes/no fallback', async () => {
  expect(optionsOf('Build it (yes, recommended), or test first (no)?')).toEqual(['yes', 'no'])
  expect(optionsOf('Delete them? (Yes = recommended / No, keep them spare)')).toEqual(['Yes', 'No, keep them spare'])
  expect(optionsOf('Which todos should I close: `1 2`, `all`, or `none`?')).toEqual(['1 2', 'all', 'none'])
  expect(optionsOf('Did you press 1 in the empty box, or click the button?')).toEqual(['yes', 'no'])
  expect(optionsOf('What should the label say?')).toEqual(['yes', 'no'])
})

test('picks build the reply; ticket keys become numbers only when opted in', async () => {
  expect(buildReply({ 3: 'PROJ-91', 1: 'Yes' })).toBe('1 yes 3 PROJ-91')
  expect(buildReply({ 3: 'PROJ-91', 1: 'Yes' }, true)).toBe('1 yes 3 91')
  expect(buildReply({ 2: 'no' })).toBe('2 no')
  expect(answerText('build all four')).toBe('build all four')
})

test('yes to all only when every question is yes/no', async () => {
  const qs = parseQuestions(REPLY)
  expect(allYesNo(qs)).toBe(false)
  expect(allYesNo(qs.slice(0, 1))).toBe(true)
  expect(allYesNo([])).toBe(false)
})
