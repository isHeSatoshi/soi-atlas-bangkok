import ClipperLib from 'clipper-lib'
import proj4 from 'proj4'
import type { Geometry, MultiPolygon, Polygon } from 'geojson'

export type Point = [number, number]
export type Ring = Point[]
export type Shape = Ring[][] // polygons → exterior followed by holes → open rings
export const GRID = 1000
// Quantization/boolean slivers only. Never used to extend statutory area or use caps.
export const AREA_EPS = 0.02
export const DIST_EPS = 0.002
const utm = proj4('EPSG:4326', '+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs')
const origin = utm.forward([100.693, 13.7848])
export const toLocal = ([x, y]: Point): Point => {
  const [e, n] = utm.forward([x, y])
  return [e - origin[0], n - origin[1]]
}
export const toWorld = ([e, n]: Point): Point => utm.inverse([e + origin[0], n + origin[1]])
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
export const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0]
export const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const same = (a: Point, b: Point) => dist(a, b) < 1e-7
export const edges = (ring: Ring): [Point, Point][] => ring.map((p, i) => [p, ring[(i + 1) % ring.length]])
export const signedArea = (ring: Ring) => edges(ring).reduce((s, [a, b]) => s + cross(a, b), 0) / 2
export const area = (shape: Shape) => shape.reduce((sum, [outer, ...holes]) =>
  sum + Math.abs(signedArea(outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0), 0)
export const perimeter = (r: Ring) => edges(r).reduce((s, [a, b]) => s + dist(a, b), 0)
export const largest = (shape: Shape): Shape => {
  let best: Shape = [], size = 0
  for (const p of shape) {
    const a = area([p])
    if (a > size) { best = [p]; size = a }
  }
  return best
}
export const close = (r: Ring): Ring => [...r, r[0]]
export const shapeGeometry = (s: Shape): Polygon | MultiPolygon => {
  const coordinates = s.map(p => p.map(r => close(r.map(toWorld))))
  return coordinates.length === 1 ? { type: 'Polygon', coordinates: coordinates[0] } : { type: 'MultiPolygon', coordinates }
}
export const localShape = (g: Geometry): Shape => {
  const ps = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  return ps.map(p => p.map(r => r.slice(0, -1).map(q => toLocal([q[0], q[1]]))))
}
export function pointSegment(p: Point, a: Point, b: Point): number {
  const v = sub(b, a), len = dot(v, v), t = len ? Math.max(0, Math.min(1, dot(sub(p, a), v) / len)) : 0
  return dist(p, [a[0] + t * v[0], a[1] + t * v[1]])
}
function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const ab = sub(b, a), cd = sub(d, c)
  const u = cross(ab, sub(c, a)), v = cross(ab, sub(d, a))
  const x = cross(cd, sub(a, c)), y = cross(cd, sub(b, c))
  return ((u > 0) !== (v > 0) && (x > 0) !== (y > 0)) ||
    pointSegment(a, c, d) < 1e-7 || pointSegment(b, c, d) < 1e-7 ||
    pointSegment(c, a, b) < 1e-7 || pointSegment(d, a, b) < 1e-7
}
export const segmentDistance = (a: Point, b: Point, c: Point, d: Point) => segmentsMeet(a, b, c, d) ? 0 :
  Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b))
export function cleanRing(input: Ring): { ring: Ring; error?: string } {
  if (input.some(p => p == null || p.length !== 2 || !p.every(Number.isFinite))) return { ring: [], error: 'Plot coordinates must be finite.' }
  const ring = input.filter((p, i) => !i || !same(input[i - 1], p))
  if (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop()
  if (ring.length < 3) return { ring, error: 'Add at least three distinct vertices.' }
  const es = edges(ring)
  for (let i = 0; i < es.length; i++) {
    if (dist(...es[i]) < 1 / GRID) return { ring, error: 'Two vertices are closer than the 1 mm geometry grid.' }
    const [a, b] = es[i], c = es[(i + 1) % es.length][1]
    if (Math.abs(cross(sub(a, b), sub(c, b))) < 1e-9 && dot(sub(a, b), sub(c, b)) > 0) return { ring, error: 'Plot edges double back on one another.' }
    for (let j = i + 2; j < es.length; j++) {
      if (i === 0 && j === es.length - 1) continue
      if (segmentsMeet(...es[i], ...es[j])) return { ring, error: 'Plot edges cross. Undo or move a vertex to make a simple ring.' }
    }
  }
  if (Math.abs(signedArea(ring)) < 0.01) return { ring, error: 'The plot has no measurable area.' }
  return { ring }
}
function path(r: Ring, positive: boolean): ClipperLib.Path {
  const ps = (signedArea(r) > 0) === positive ? r : [...r].reverse()
  return ps.map(([x, y]) => ({ X: Math.round(x * GRID), Y: Math.round(y * GRID) }))
}
const paths = (shape: Shape) => shape.flatMap(p => p.map((r, i) => path(r, i === 0)))
function unpack(tree: ClipperLib.PolyTree): Shape {
  const out: Shape = []
  const ring = (n: ClipperLib.PolyNode): Ring => n.Contour().map(p => [p.X / GRID, p.Y / GRID])
  function visit(n: ClipperLib.PolyNode) {
    if (!n.IsHole()) out.push([ring(n), ...n.Childs().filter(x => x.IsHole()).map(ring)])
    n.Childs().forEach(visit)
  }
  tree.Childs().forEach(visit)
  return out
}
function boolean(a: Shape, b: Shape, op: ClipperLib.ClipType): Shape {
  const c = new ClipperLib.Clipper(2) // StrictlySimple
  c.AddPaths(paths(a), ClipperLib.PolyType.ptSubject, true)
  if (b.length) c.AddPaths(paths(b), ClipperLib.PolyType.ptClip, true)
  const out = new ClipperLib.PolyTree()
  c.Execute(op, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return unpack(out)
}
export const intersect = (a: Shape, b: Shape): Shape => a.length && b.length ? boolean(a, b, ClipperLib.ClipType.ctIntersection) : []
export const difference = (a: Shape, b: Shape): Shape => a.length && b.length ? boolean(a, b, ClipperLib.ClipType.ctDifference) : a
export const union = (a: Shape): Shape => boolean(a, [], ClipperLib.ClipType.ctUnion)
export function bufferSegments(es: [Point, Point][], meters: number): Shape {
  const o = new ClipperLib.ClipperOffset(2, 0.25)
  for (const e of es) o.AddPath(path(e, true), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound)
  const out = new ClipperLib.PolyTree()
  o.Execute(out, meters * GRID)
  return unpack(out)
}
export function frame(a: Point, b: Point, inwardIsLeft: boolean) {
  const v = sub(b, a), len = dist(a, b), u: Point = [v[0] / len, v[1] / len]
  const n: Point = inwardIsLeft ? [-u[1], u[0]] : [u[1], -u[0]]
  return {
    len, into: (p: Point): Point => [dot(sub(p, a), u), dot(sub(p, a), n)],
    from: (s: number, d: number): Point => [a[0] + s * u[0] + d * n[0], a[1] + s * u[1] + d * n[1]],
  }
}
export type Frame = ReturnType<typeof frame>
export function bounds(s: Shape, f: Frame) {
  let s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity
  for (const p of s.flat(2)) {
    const [x, y] = f.into(p)
    s0 = Math.min(s0, x); s1 = Math.max(s1, x); d0 = Math.min(d0, y); d1 = Math.max(d1, y)
  }
  return { s0, s1, d0, d1 }
}
export const rect = (f: Frame, s0: number, s1: number, d0: number, d1: number): Shape =>
  s1 > s0 && d1 > d0 ? [[[f.from(s0, d0), f.from(s1, d0), f.from(s1, d1), f.from(s0, d1)]]] : []
