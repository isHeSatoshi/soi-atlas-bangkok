import { siteFrame, type Frontage } from '../domain/envelope'
import { edges, toWorld, type Point, type Ring, type Shape } from '../domain/geo'
import type { Option } from '../domain/solve'

export function intervals(s: Shape, into: (p: Point) => Point, station: number) {
  const result: [number, number][] = []
  for (const p of s) {
    const crossings = p.flatMap(r => edges(r).flatMap(([p, q]) => {
      const [a, d] = into(p), [b, e] = into(q)
      return (a <= station && b > station) || (b <= station && a > station) ? [d + (e - d) * (station - a) / (b - a)] : []
    })).sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) result.push([crossings[i], crossings[i + 1]])
  }
  return result
}
export function roadSection(plot: Ring, frontage: Frontage, option?: Option) {
  const basis = siteFrame(plot, frontage)
  if (!basis) return null
  const { f } = basis
  const top = option?.floors.at(-1)
  const xs = Array.from(new Set((top?.polygon ?? []).flat(2).map(p => f.into(p)[0]))).sort((a, b) => a - b)
  const widths = xs.slice(1).map((r, i) => ({ s: (r + xs[i]) / 2, span: r - xs[i] })).sort((a, b) => b.span - a.span)
  const station = widths.find(x => top && x.s >= 0 && x.s <= f.len && intervals(top.polygon, f.into, x.s).length)?.s ?? f.len / 2
  const end = intervals([[plot]], f.into, station).find(([start]) => start < 0.002)?.[1] ?? 0
  const maxDepth = Math.max(0, Math.floor(end * 10) / 10)
  return { f, station, maxDepth, atDepth: (d: number) => toWorld(f.from(station, d)) }
}
