import type { FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson'
import plotsRaw from '../planning/evidence/example-plots.geojson?raw'
import roadsUrl from '../planning/evidence/roads.osm.geojson?url'
import buildingsUrl from '../planning/evidence/buildings.overture.geojson?url'
import { area, cross, dist, dot, edges, intersect, localShape, pointSegment, signedArea, sub, toLocal, type Point, type Ring, type Shape } from './domain/geo'

export const STUDY_BOUNDS: [Point, Point] = [[100.69155, 13.78350], [100.69385, 13.78520]]
export const CAMERA_BOUNDS: [Point, Point] = [[100.690, 13.7828], [100.696, 13.7885]]
const [[west, south], [east, north]] = STUDY_BOUNDS
export const studyRing: Ring = [[west, south], [east, south], [east, north], [west, north]]
export const supportedArea: Shape = [[studyRing.map(toLocal)]]
export const DEFAULT_CENTER: Point = [100.6930843, 13.7847500]
type PlotProps = { label: string; front_edge: [number, number]; road_osm_id: number; assumed_public_row_m: number; default_program: 'multifamily' | 'office' }
type RoadProps = { osm_id: number; highway: string; access: string | null }
export type Roads = FeatureCollection<LineString, RoadProps>
export type Buildings = FeatureCollection<Polygon | MultiPolygon>
export const EXAMPLES = (JSON.parse(plotsRaw) as FeatureCollection<Polygon, PlotProps>).features.map(f => ({
  id: String(f.id), label: f.properties.label, ring: f.geometry.coordinates[0].slice(0, -1) as Ring,
  front: f.properties.front_edge[0], roadId: f.properties.road_osm_id, width: f.properties.assumed_public_row_m, program: f.properties.default_program,
}))
type MappedRoad = { id: number; publicCandidate: boolean; segments: [Point, Point][] }
type Context = { roads: Roads; buildings: Buildings; mappedRoads: MappedRoad[]; neighbors: { shape: Shape; bounds: number[] }[] }
let contextPromise: Promise<Context> | undefined
export function loadContext() {
  return contextPromise ??= Promise.all([fetch(roadsUrl), fetch(buildingsUrl)]).then(async ([r, b]) => {
    if (!r.ok || !b.ok) throw new Error('Local map data could not load.')
    const [roads, buildings]: [Roads, Buildings] = await Promise.all([r.json(), b.json()])
    return { roads, buildings,
      mappedRoads: roads.features.map(f => {
        const pts = f.geometry.coordinates.map(p => toLocal([p[0], p[1]]))
        return { id: f.properties.osm_id,
          publicCandidate: !['private', 'no'].includes(f.properties.access ?? '') &&
            ['residential', 'unclassified', 'living_street', 'tertiary', 'secondary', 'primary'].includes(f.properties.highway),
          segments: pts.slice(1).map((p, i) => [pts[i], p]) }
      }),
      neighbors: buildings.features.map(f => { const shape = localShape(f.geometry); return { shape, bounds: bbox(shape.flat(2)) } }),
    }
  })
}
export type SiteContext = Awaited<ReturnType<typeof loadContext>>
function bbox(r: Ring) {
  return r.reduce(([x, y, X, Y], p) => [Math.min(x, p[0]), Math.min(y, p[1]), Math.max(X, p[0]), Math.max(Y, p[1])], [Infinity, Infinity, -Infinity, -Infinity])
}
export function overlapsBuildings(plot: Ring, context: SiteContext) {
  if (!plot.length) return false
  const [x, y, X, Y] = bbox(plot)
  return context.neighbors.some(({ shape, bounds: [a, b, A, B] }) => x < A && X > a && y < B && Y > b && area(intersect([[plot]], shape)) > 0.02)
}
function adjacent(a: Point, b: Point, road: MappedRoad, winding: number) {
  const v = sub(b, a), len = dist(a, b)
  if (len < 0.2) return false
  const samples = [0.1, 0.5, 0.9].map(t => [a[0] + t * v[0], a[1] + t * v[1]] as Point)
  return samples.every(p => road.segments.some(([c, d]) => {
    const w = sub(d, c), m = dist(c, d)
    const along = dot(v, w)
    const exterior = m ? Math.sign(along) * winding * cross(w, sub(p, c)) / m : 0
    return m > 0 && Math.abs(along) / (len * m) >= 0.965 && exterior >= 0.45 && pointSegment(p, c, d) <= 7.5
  }))
}
export function matchFrontage(plot: Ring, roadId: number, index: number | null, context: SiteContext) {
  const road = context.mappedRoads.find(r => r.id === roadId), ringEdges = edges(plot), winding = Math.sign(signedArea(plot))
  const choices = road ? ringEdges.flatMap(([a, b], i) => adjacent(a, b, road, winding) ? [i] : []) : []
  const actual = index === null ? (choices.length === 1 ? choices[0] : null) : choices.includes(index) ? index : null
  const frontage = actual === null ? null : { a: ringEdges[actual][0], b: ringEdges[actual][1], wayId: roadId }
  const corner = frontage && context.mappedRoads.some(r => r.id !== roadId && r.publicCandidate &&
    ringEdges.some(([a, b], i) => i !== actual && dist(a, b) >= 4 && adjacent(a, b, r, winding)))
  return { choices, frontage, unsupportedFrontage: corner ? 'A second mapped street adjoins this plot. Corner or multiple-road sites are outside the single-frontage model.' : undefined }
}
