// A pixel person per agent, drawn from scratch (no tileset): the same name always gives the same person.
// 18x32 cells, front view, standing: legs → torso → arms → head → hair → face, then a dark outline ring.
type Rgb = readonly [number, number, number]

const W = 18
const H = 32
const OUTLINE: Rgb = [38, 34, 46]
// Skin as highlight, base, shadow.
const SKINS: readonly (readonly [Rgb, Rgb, Rgb])[] = [
  [[255, 221, 189], [247, 201, 170], [212, 158, 126]],
  [[232, 182, 136], [214, 162, 116], [176, 126, 86]],
  [[180, 130, 94], [158, 112, 78], [124, 86, 58]],
  [[142, 98, 70], [120, 80, 56], [94, 62, 42]],
]
const HAIRS: readonly Rgb[] = [[43, 38, 48], [94, 62, 40], [140, 70, 44], [214, 176, 92], [150, 148, 156]]
const SHIRTS: readonly Rgb[] = [[217, 106, 98], [92, 169, 122], [74, 144, 158], [198, 160, 74], [140, 122, 186], [104, 118, 140]]
const TROUSERS: readonly Rgb[] = [[58, 66, 92], [62, 60, 70], [150, 130, 96]]
// The terminal draws a face instead of pixels.
const FACES = ['🧑', '👩', '👨', '🧔', '👱', '🧓']

const shade = (c: Rgb, f: number): Rgb => c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))) as unknown as Rgb

// FNV-1a over the name; a second pass with a suffix gives the fifth byte.
function fnv(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  return h
}

export function traits(name: string) {
  const h = fnv(name)
  const pick = <T>(list: readonly T[], byte: number) => list[byte % list.length] as T
  return {
    skin: pick(SKINS, h & 255),
    hair: pick(HAIRS, (h >>> 8) & 255),
    shirt: pick(SHIRTS, (h >>> 16) & 255),
    trousers: pick(TROUSERS, h >>> 24),
    style: fnv(`${name}#`) % 4, // 0 short crop, 1 side part, 2 long, 3 receding
  }
}

export function pixels(name: string): Map<string, Rgb> {
  const { skin: [hi, base, dk], hair, shirt, trousers, style } = traits(name)
  const px = new Map<string, Rgb>()
  const rect = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) px.set(`${x},${y}`, c)
  }
  rect(6, 26, 8, 30, trousers)
  rect(9, 26, 11, 30, trousers)
  rect(6, 31, 11, 31, shade(trousers, 0.55))
  rect(6, 17, 11, 26, shirt)
  rect(6, 17, 6, 26, shade(shirt, 0.82))
  rect(11, 17, 11, 26, shade(shirt, 1.12))
  rect(4, 18, 5, 24, shade(shirt, 0.9))
  rect(12, 18, 13, 24, shade(shirt, 0.9))
  rect(4, 25, 5, 26, base)
  rect(12, 25, 13, 26, base)
  rect(4, 6, 13, 16, base)
  rect(4, 6, 4, 16, dk)
  rect(13, 6, 13, 16, hi)
  if (style === 0) {
    rect(3, 4, 14, 8, hair)
    rect(3, 8, 4, 11, hair)
    rect(13, 8, 14, 11, hair)
  } else if (style === 1) {
    rect(3, 4, 14, 7, hair)
    rect(3, 7, 6, 10, hair)
    rect(13, 7, 14, 9, hair)
  } else if (style === 2) {
    rect(3, 4, 14, 8, hair)
    rect(2, 6, 3, 20, hair)
    rect(14, 6, 15, 20, hair)
  } else {
    rect(4, 5, 13, 7, hair)
    rect(3, 7, 4, 11, hair)
    rect(13, 7, 14, 11, hair)
  }
  rect(6, 11, 7, 12, OUTLINE)
  rect(10, 11, 11, 12, OUTLINE)
  rect(8, 14, 9, 14, shade(dk, 0.8))
  // Ring the silhouette: every empty cell touching a filled one.
  for (const key of [...px.keys()]) {
    const [x, y] = key.split(',').map(Number) as [number, number]
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && !px.has(`${nx},${ny}`)) px.set(`${nx},${ny}`, OUTLINE)
    }
  }
  return px
}

// One <rect> per same-colored run in a row; crisp edges keep the pixels square at any size.
export function avatarSvg(name: string): string {
  const px = pixels(name)
  const rects: string[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; ) {
      const c = px.get(`${x},${y}`)
      let end = x + 1
      while (c && end < W && px.get(`${end},${y}`)?.join() === c.join()) end++
      if (c) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="rgb(${c.join(',')})"/>`)
      x = end
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

export const avatarEmoji = (name: string) => FACES[fnv(name) % FACES.length] as string
