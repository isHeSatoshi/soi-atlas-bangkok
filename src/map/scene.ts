import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { LayerSpecification } from 'maplibre-gl'
import { siteFrame, type Frontage, type Slice } from '../domain/envelope'
import { bounds, bufferSegments, close, difference, intersect, rect, shapeGeometry, toLocal, toWorld, type Point, type Ring, type Shape } from '../domain/geo'
import type { Option } from '../domain/solve'
import type { RuleId } from '../domain/rules'
import { studyRing } from '../site'
import { castShadow, shadowVector } from './shadow'
import type { groundScreens } from '../domain/diligence'

const get = (key: string) => ['get', key] as ['get', string]
const select = (kind: string) => ['==', get('kind'), kind] as ['==', ['get', string], string]
const fill = (id: string, kind: string, color: string, opacity: number): LayerSpecification =>
  ({ id, type: 'fill', source: 'study', filter: select(kind), paint: { 'fill-color': color, 'fill-opacity': opacity } })
const line = (id: string, kind: string, color: string, width: number, dash?: number[]): LayerSpecification =>
  ({ id, type: 'line', source: 'study', filter: select(kind), layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': width, ...(dash ? { 'line-dasharray': dash } : {}) } })
const extrude = (id: string, kind: string, opacity = 1): LayerSpecification =>
  ({ id, type: 'fill-extrusion', source: 'study', filter: select(kind), paint: {
    'fill-extrusion-color': get('color'), 'fill-extrusion-height': get('top'), 'fill-extrusion-base': get('base'),
    'fill-extrusion-opacity': opacity, 'fill-extrusion-vertical-gradient': false,
  } })
export const groundLayers = [
  fill('study-plot', 'plot', '#e3ccaa', 0.84),
  fill('study-open', 'open', '#d2dcb2', 0.94),
  fill('study-planting', 'planting', '#78976a', 0.77),
  fill('study-access', 'access', '#f4ead6', 0.97),
  fill('study-shadow', 'shadow', '#364756', 0.26),
  fill('study-open-highlight', 'openHighlight', '#a2b57a', 0.44),
  fill('study-plant-highlight', 'plantHighlight', '#42754c', 0.52),
  fill('study-access-highlight', 'accessHighlight', '#f1c36c', 0.75),
  fill('study-private', 'private', '#bd8354', 0.38),
  fill('study-frontstrip', 'frontstrip', '#5e9bc6', 0.43),
  fill('study-row', 'row', '#72a3c9', 0.5),
  fill('study-reservation', 'reservation', '#b47791', 0.66),
  line('study-reservation-edge', 'reservation', '#875169', 2.2, [2, 1.8]),
  fill('study-car-aisle', 'carAisle', '#d5af66', 0.64),
  fill('study-car-bay', 'carBay', '#a67426', 0.8),
  line('study-car-bay-edge', 'carBay', '#fff7da', 2),
  fill('study-fire', 'fire', '#ad513b', 0.66),
  line('study-fire-edge', 'fire', '#873923', 2.2, [2, 1.8]),
  line('study-centerline', 'centerline', '#4381aa', 2, [2, 1.5]),
  line('study-far', 'far', '#396e97', 2, [3, 2]),
  line('study-near', 'near', '#306589', 3),
  line('study-plot-edge', 'plot', '#87573f', 1.8),
  line('study-envelope-edge', 'envelopeEdge', '#477e9d', 1.8, [2, 2]),
  line('study-window', 'window', '#7c8b7c', 1.3, [3, 3]),
  line('study-edit-edge', 'editEdge', '#31799f', 3, [2, 1]),
  line('study-sketch', 'sketch', '#963f2a', 2.2),
  line('study-compare-outline', 'compareOutline', '#0f6767', 2.7, [2, 1.8]),
  line('study-section-cut', 'sectionCut', '#0f6767', 2.4, [2, 1.8]),
  { id: 'study-probe', type: 'circle', source: 'study', filter: select('probe'),
    paint: { 'circle-color': '#086969', 'circle-radius': 5, 'circle-stroke-color': '#fffefb', 'circle-stroke-width': 1.8 } } as LayerSpecification,
]
export const massLayers = [extrude('study-envelope', 'envelope', 0.33), extrude('study-joint', 'joint'), extrude('study-floor', 'floor'),extrude('study-sill','sill')]

export type Scene = {
  ring: Ring; previewRing?: Ring; valid: boolean; option?: Option; preview?: Option
  frontage: Frontage | null; width: number; roadId: number
  envelope: boolean; slices: Slice[]; level: number | null; rule: RuleId | null; editing: boolean; edgeChoices: number[]
  sketch?: Ring; comparison?: Option; sectionProbe?: { line: [Point, Point]; at: Point }; cutFloor?:number|null
  reservation?: Shape; ground?: ReturnType<typeof groundScreens>; activeScan?: 'parking' | 'fire' | null
}
const openRules: (RuleId | null)[] = ['Z-OSR', 'B-OPEN', 'N-OPEN']
const budgetRules: (RuleId | null)[] = ['Z-FAR', 'Z-USE', 'STUDY-GFA', 'STUDY-H']
export function sceneData(m: Scene, centerline: Geometry | undefined, solarHour?:number|null): FeatureCollection {
  const features: Feature[] = []
  const add = (kind: string, geometry: Geometry, props = {}) => features.push({ type: 'Feature', geometry, properties: { kind, ...props } })
  const shape = (kind: string, s: Shape, props = {}) => { if (s.length) add(kind, shapeGeometry(s), props) }
  const line = (kind: string, pts: Ring, props = {}) => { if (pts.length >= 2) add(kind, { type: 'LineString', coordinates: pts }, props) }
  const plot = m.ring.map(toLocal), p: Shape = [[plot]]
  if (m.valid && plot.length > 2) shape('plot', p)
  if (m.preview && m.previewRing && m.previewRing !== m.ring) shape('plot', [[m.previewRing.map(toLocal)]])
  if (m.editing || !m.valid) line('window', close(studyRing))
  if (m.editing) {
    const ring = m.sketch ?? m.ring
    line('sketch', m.sketch ? ring : (ring.length ? close(ring) : ring))
    if (!m.sketch) for (const i of m.edgeChoices) line('editEdge', [ring[i], ring[(i + 1) % ring.length]], { edge: i })
  }
  if (centerline) add('centerline', centerline)
  const basis = m.frontage && plot.length >= 3 ? siteFrame(plot, m.frontage) : null
  if (basis && Number.isFinite(m.width) && m.width > 0 && m.width <= 60) {
    const { f, privateEdges } = basis
    shape('row', rect(f, -3, f.len + 3, -m.width, 0))
    line('near', [f.from(0, 0), f.from(f.len, 0)].map(toWorld))
    line('far', [f.from(-3, -m.width), f.from(f.len + 3, -m.width)].map(toWorld))
    const slice = m.slices[m.level === null ? m.slices.length - 1 : m.level - 1]
    if (slice && (m.rule === 'B/N-FRONT' || m.rule === 'B/N-SKY' || m.rule === 'B-RING')) {
      const distance = m.rule === 'B/N-FRONT' ? slice.roadM : m.rule === 'B-RING' ? slice.ringM : slice.skyM
      const b = bounds(p, f)
      const { polygon } = slice
      if (distance > 0) {
        // Exact plot clip is required because the street strip may cross a concave return.
        shape('frontstrip', difference(p, rect(f, b.s0 - 1, b.s1 + 1, distance, b.d1 + 1)))
      }
      if (m.rule === 'B/N-SKY') shape('envelopeEdge', polygon)
    }
    if (slice && (m.rule === 'B/N-SIDE' || m.rule === 'B-RING')) {
      shape('private', intersect(p, bufferSegments(privateEdges, m.rule === 'B/N-SIDE' ? slice.sideM : slice.ringM)))
    }
  }
  const o = m.option ?? m.preview
  if (o) {
    shape('open', o.openGeometry)
    shape('planting', o.plantedGeometry)
    shape('access', [...o.approach, ...o.rearWalk])
    if (m.option && solarHour != null && !m.editing) {
      const mass=m.cutFloor?o.floors.slice(0,m.cutFloor):o.floors
      shape('shadow',castShadow(mass,shadowVector(meanPoint(m.ring)[1],solarHour)))
    }
    if (m.option && openRules.includes(m.rule)) shape('openHighlight', o.openGeometry)
    if (m.option && m.rule === 'Z-PLANT') shape('plantHighlight', o.plantedGeometry)
    if (m.option && m.rule === 'B-FRONTAGE') shape('accessHighlight', o.approach)
    if (m.option && m.rule === 'B-REAR') shape('accessHighlight', o.rearWalk)
    o.floors.forEach(({ polygon, baseM, topM }, i) => {
      if (m.cutFloor && i+1>m.cutFloor) return
      const chosen = m.level === i + 1
      const color = m.preview && !m.option ? '#b0a592' : budgetRules.includes(m.rule) && m.level === null ? '#b55d3c' : m.envelope ? (chosen ? '#b26a48' : '#cb9b78') :
        m.level === null || chosen ? (chosen ? '#b64f31' : '#bf7551') : '#c99774'
      shape('joint', polygon, { base: baseM, top: baseM + 0.16, color: '#824e3e', level:i+1 })
      shape('floor', polygon, { base: baseM + 0.16, top: topM-.26, color, level: i + 1 })
      shape('sill', polygon, {base:topM-.26,top:topM,color:chosen?'#f1a668':'#dfa782',level:i+1})
    })
  }
  if (m.envelope) {
    const slices = m.level === null ? m.slices : m.slices.filter(s => s.level === m.level)
    for (const s of slices) {
      shape('envelope', s.polygon, { base: s.baseM, top: s.topM, color: '#6397b2' })
      shape('envelopeEdge', s.polygon)
    }
  }
  if (m.comparison) shape('compareOutline', m.comparison.covered)
  if (m.reservation?.length) shape('reservation', m.reservation)
  if (m.activeScan === 'parking' && m.ground?.parking.bays.length) {
    const { aisle, access, bays } = m.ground.parking
    shape('carAisle', [...aisle, ...access])
    for (const bay of bays) shape('carBay', bay)
  }
  if (m.activeScan === 'fire' && m.ground?.fire.length) shape('fire', m.ground.fire)
  if (m.sectionProbe) {
    line('sectionCut', m.sectionProbe.line)
    add('probe', { type: 'Point', coordinates: m.sectionProbe.at })
  }
  return { type: 'FeatureCollection', features }
}
export const meanPoint = (r: Ring): Point => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]
