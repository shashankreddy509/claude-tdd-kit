import { expect, test } from 'claude-code/testing'

import { avatarEmoji, avatarSvg, pixels, traits } from './avatar'

const NAMES = ['map the mods', 'Explore', 'general-purpose', 'Summarise video', 'fix the band', 'review PR']

test('same name, same person; different names give different people', () => {
  expect(avatarSvg('Explore')).toBe(avatarSvg('Explore'))
  expect(avatarEmoji('Explore')).toBe(avatarEmoji('Explore'))
  expect(new Set(NAMES.map(avatarSvg)).size).toBeGreaterThan(3)
  expect(new Set(NAMES.map(n => traits(n).style)).size).toBeGreaterThan(1)
})

test('figure: eyes, outline ring around the silhouette, nothing outside 18x32', () => {
  const px = pixels('Explore')
  const outline = '38,34,46'
  expect(px.get('6,11')?.join()).toBe(outline) // left eye
  expect(px.get('5,31')?.join()).toBe(outline) // ring beside the left foot
  expect(px.get('12,31')?.join()).toBe(outline) // ring beside the right foot
  expect(px.get('0,0')).toBeUndefined() // corners stay transparent
  for (const key of px.keys()) {
    const [x, y] = key.split(',').map(Number) as [number, number]
    expect(x >= 0 && x < 18 && y >= 0 && y < 32).toBe(true)
  }
})

test('svg: square pixels, no text, rows merged into runs', () => {
  const svg = avatarSvg('Explore')
  expect(svg).toContain('viewBox="0 0 18 32"')
  expect(svg).toContain('shape-rendering="crispEdges"')
  expect(svg).not.toContain('<text')
  expect(svg.match(/<rect /g)?.length ?? 0).toBeLessThan(pixels('Explore').size)
})
