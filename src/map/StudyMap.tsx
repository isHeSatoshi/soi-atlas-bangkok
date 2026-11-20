import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Compass, Focus, Layers2, Map as MapIcon, Minus, Plus, Sun } from 'lucide-react'
import maplibregl, { type GeoJSONSource, type Map as MapInstance, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import style from './style.json'
import { groundLayers, massLayers, meanPoint, sceneData, type Scene } from './scene'
import { CAMERA_BOUNDS, DEFAULT_CENTER, EXAMPLES, type SiteContext } from '../site'
import { toLocal, toWorld, type Point } from '../domain/geo'
import { siteFrame } from '../domain/envelope'

type Debug = { instances: number; project?: (p: Point) => Point; events: { revision: number; ms: number }[];
  ui: { revision: number; ms: number }[]; firstMs?: number; counts?: [number, number] }
declare global { interface Window { plotStudyDebug?: Debug } }
if (new URLSearchParams(location.search).has('measure')) window.plotStudyDebug = { instances: 0, events: [], ui: [] }
const OBLIQUE = { pitch: 53, bearing: 12 }
const VIEW_ZOOM = 19.27

type Props = {
  scene: Scene; context?: SiteContext; contextError: boolean; focus: { ring: Point[]; revision: number }; editing: boolean
  touring: boolean
  selectedVertex: number; revision: { id: number; start: number }
  onClick: (p: Point, edge?: number, floor?: number) => void
  onVertex: (i: number) => void; onMove: (i: number, point: Point) => void; onDragStart: () => void; onDragEnd: () => void
}
export function StudyMap(props: Props) {
  const el = useRef<HTMLDivElement>(null), map = useRef<MapInstance | null>(null)
  const callbacks = useRef(props)
  useLayoutEffect(() => { callbacks.current = props })
  const [ready, setReady] = useState(false), [error, setError] = useState(false)
  const [flat, setFlat] = useState(false), [mode, setMode] = useState<'3d' | 'plan'>('3d')
  const [sun,setSun]=useState<number|null>(null)
  const solarHour=props.scene.option && !props.editing && !props.touring ? sun : null
  const compass = useRef<HTMLSpanElement>(null)
  const dimension = useRef<SVGGElement>(null)
  const previous = useRef({...OBLIQUE,zoom:VIEW_ZOOM}), markers = useRef<maplibregl.Marker[]>([])
  const priorCamera = useRef<{ center: maplibregl.LngLat; zoom: number; pitch: number; bearing: number } | null>(null)
  const dragged = useRef(false), restoring = useRef<number | null>(null)
  useEffect(() => {
    if (!el.current) return
    let m: MapInstance
    try {
      m = new maplibregl.Map({
        container: el.current, style: style as unknown as StyleSpecification, center: DEFAULT_CENTER, zoom: VIEW_ZOOM,
        ...OBLIQUE, maxBounds: CAMERA_BOUNDS, minZoom: 16, maxZoom: 22,
        maxPitch: 70, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { antialias: true },
      })
    } catch { setError(true); return }
    map.current = m
    m.getCanvas().setAttribute('aria-label', 'Interactive map of Soi Ramkhamhaeng and the selected site')
    const rotate = () => { if (compass.current) compass.current.style.transform = `rotate(${-m.getBearing()}deg)` }
    m.on('rotate', rotate); rotate()
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 88, unit: 'metric' }), 'bottom-right')
    m.on('load', () => {
      groundLayers.forEach(l => m.addLayer(l, 'neighbor-mass'))
      massLayers.forEach(l => m.addLayer(l))
      const labels: [Point, string][] = [
        [[100.6932665, 13.7846546], 'SOI 144'],
        [[100.6917745, 13.784177], 'SOI 142/1'],
      ]
      for (const [position, label] of labels) {
        const node = document.createElement('div')
        node.className = 'street-label'; node.textContent = label; node.setAttribute('aria-hidden', 'true')
        new maplibregl.Marker({ element: node, offset: [4, 16] }).setLngLat(position).addTo(m)
      }
      setReady(true)
    })
    m.on('error', e => { if (!m.isStyleLoaded() && /webgl|context/i.test(e.error.message)) setError(true) })
    m.on('click', e => {
      if (dragged.current) return
      const p: Point = [e.lngLat.lng, e.lngLat.lat]
      const props = callbacks.current
      if (props.scene.sketch) { props.onClick(p); return }
      const layer = props.editing ? 'study-edit-edge' : 'study-floor'
      const hit = m.getLayer(layer) && m.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers:props.editing?[layer]:['study-sill',layer,'study-joint'] })[0]
      if (hit) props.onClick(p, hit.properties.edge, hit.properties.level)
    })
    const observer = new ResizeObserver(() => m.resize())
    observer.observe(el.current)
    const debug = window.plotStudyDebug
    if (debug) {
      debug.instances++
      debug.project = p => { const v = m.project(p); return [v.x, v.y] }
    }
    return () => {
      observer.disconnect()
      if (restoring.current !== null) cancelAnimationFrame(restoring.current)
      m.remove(); map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !ready || !props.context) return
    ;(m.getSource('roads') as GeoJSONSource).setData(props.context.roads)
    ;(m.getSource('neighbors') as GeoJSONSource).setData(props.context.buildings)
    if (window.plotStudyDebug) window.plotStudyDebug.counts = [props.context.roads.features.length, props.context.buildings.features.length]
  }, [ready, props.context])
  useEffect(() => {
    if (ready) map.current?.setPaintProperty('neighbor-mass', 'fill-extrusion-height', flat ? 0 : 6)
  }, [ready, flat])
  const {frontage,ring,width,option}=props.scene
  useEffect(()=>{
    const m=map.current, g=dimension.current
    if(!ready||!m||!g||!frontage||!option||props.editing)return
    const frame=siteFrame(ring.map(toLocal),frontage)?.f
    if(!frame)return
    // Dimension the actual two modeled ROW edges, not the OSM centerline.
    const s=frame.len*.78, near=toWorld(frame.from(s,0)), far=toWorld(frame.from(s,-width))
    const update=()=>{
      const a=m.project(near), b=m.project(far),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)
      if(len<7){g.style.visibility='hidden';return}
      g.style.visibility='visible'
      const nx=-dy/len*3,ny=dx/len*3, sign=dx>=0?1:-1
      const line=g.querySelector('path')!, label=g.querySelector('g')!
      const x=b.x+dx/len*13,y=b.y+dy/len*13
      line.setAttribute('d',`M${a.x-nx} ${a.y-ny}l${2*nx} ${2*ny} M${a.x} ${a.y}L${x} ${y}h${sign*15} M${b.x-nx} ${b.y-ny}l${2*nx} ${2*ny}`)
      label.setAttribute('transform',`translate(${x+(sign>0?15:-106)},${y-9})`)
    }
    update();m.on('move',update);m.on('resize',update)
    return ()=>{m.off('move',update);m.off('resize',update)}
  },[ready,ring,frontage,width,Boolean(option),props.editing])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const { scene, context, revision } = props
    const centerline = context?.roads.features.find(f => f.properties.osm_id === scene.roadId)?.geometry
    const source = m.getSource('study') as GeoJSONSource
    const debug = window.plotStudyDebug
    const data = sceneData(scene, centerline,solarHour)
    if (!debug) { source.setData(data); return }
    const measure = () => {
      if (!context || callbacks.current.revision.id !== revision.id || !m.isSourceLoaded('study')) return
      if (debug.firstMs === undefined && scene.option && m.isSourceLoaded('roads') && m.isSourceLoaded('neighbors')) debug.firstMs = performance.now()
      if (revision.id !== 0 && !debug.events.some(e => e.revision === revision.id)) debug.events.push({ revision: revision.id, ms: performance.now() - revision.start })
    }
    let canceled = false
    source.setData(data, true).then(() => {
      if (!canceled) { m.on('render', measure); m.triggerRepaint() }
    }).catch(() => { /* A subsequent revision or map error supersedes the sample. */ })
    return () => { canceled = true; m.off('render', measure) }
  }, [ready, props.scene, props.context, props.revision,solarHour])
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !props.focus.revision) return
    m.easeTo({ center: meanPoint(props.focus.ring), zoom: VIEW_ZOOM, duration: 380 })
  }, [props.focus, ready])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (props.touring && !priorCamera.current) {
      priorCamera.current = { center: m.getCenter(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() }
      setMode('3d'); m.easeTo({ center: DEFAULT_CENTER, zoom: VIEW_ZOOM, ...OBLIQUE, duration: 390 })
    } else if (!props.touring && priorCamera.current) {
      const old = priorCamera.current
      priorCamera.current = null
      setMode(old.pitch > 0 ? '3d' : 'plan'); m.easeTo({ ...old, duration: 390 })
    }
  }, [props.touring, ready])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (props.editing) {
      previous.current = { pitch: m.getPitch(), bearing: m.getBearing(), zoom:m.getZoom() }
      m.jumpTo({ pitch: 0, bearing: 0,zoom:Math.min(m.getZoom(),18.65) })
      m.dragRotate.disable(); m.touchZoomRotate.disableRotation()
      setMode('plan')
    } else {
      m.dragRotate.enable(); m.touchZoomRotate.enableRotation()
      m.jumpTo(previous.current); setMode(previous.current.pitch > 0 ? '3d' : 'plan')
    }
  }, [props.editing, ready])

  const editRing = props.scene.sketch ?? props.scene.ring
  const drawing = Boolean(props.scene.sketch)
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const count = props.editing ? editRing.length : 0
    while (markers.current.length > count) markers.current.pop()?.remove()
    for (let i = markers.current.length; i < count; i++) {
      const node = document.createElement('button')
      node.type = 'button'; node.className = 'vertex'
      const marker = new maplibregl.Marker({ element: node, draggable: !drawing, clickTolerance: 3 }).setLngLat(editRing[i]).addTo(m)
      node.addEventListener('click', e => { e.stopPropagation(); if (!dragged.current) callbacks.current.onVertex(i) })
      marker.on('dragstart', () => { dragged.current = true; m.dragPan.disable(); callbacks.current.onDragStart(); callbacks.current.onVertex(i) })
      marker.on('drag', () => {
        const { lng, lat } = marker.getLngLat()
        callbacks.current.onMove(i, [lng, lat])
      })
      marker.on('dragend', () => {
        callbacks.current.onDragEnd(); m.dragPan.enable()
        restoring.current = requestAnimationFrame(() => { dragged.current = false; restoring.current = null })
      })
      markers.current.push(marker)
    }
    for (let i = 0; i < count; i++) {
      const marker = markers.current[i], node = marker.getElement()
      marker.setDraggable(!drawing)
      if (!dragged.current) marker.setLngLat(editRing[i])
      node.classList.toggle('active', i === props.selectedVertex)
      node.classList.toggle('close-vertex', drawing && i === 0 && count >= 3)
      node.setAttribute('aria-label', drawing && i === 0 && count >= 3 ? 'Close plot at first vertex' : `Vertex ${i + 1}`)
    }
  }, [ready, editRing, props.editing, props.selectedVertex, drawing])

  function changeMode(next: '3d' | 'plan') {
    if (props.editing || !map.current) return
    setMode(next)
    map.current.easeTo({ ...(next === 'plan' ? { pitch: 0, bearing: 0 } : OBLIQUE), duration: 310 })
  }
  return <section className={`map-card ${props.editing ? 'is-editing' : ''}`} aria-label="Site map">
    <div className="map-canvas" ref={el} data-testid="map-canvas" />
    {ready && frontage && option && !props.editing && <svg className="row-dimension" aria-hidden="true">
      <g ref={dimension}><path fill="none" stroke="#356376" strokeWidth="1.25"/><g>
        <rect width="91" height="18" rx="2" fill="#f5faf4" stroke="#96afb1"/>
        <text x="45.5" y="12" textAnchor="middle">{Number(width.toFixed(2))} m ROW</text>
      </g></g>
    </svg>}
    {(!ready || error || props.contextError) && <div className="map-status" role="status">
      <MapIcon size={23} /><strong>{error ? '3D map unavailable' : props.contextError ? 'Local context unavailable' : 'Loading the study area…'}</strong>
      {error && <span>WebGL is required to view or edit the map. Scenario inputs and rule results are still available.</span>}
    </div>}
    <div className="map-top">
      <div className="map-modes">
        <button type="button" aria-pressed={mode === '3d'} disabled={props.editing || !ready} onClick={() => changeMode('3d')}><Box size={15}/> 3D</button>
        <button type="button" aria-pressed={mode === 'plan'} disabled={props.editing || !ready} onClick={() => changeMode('plan')}><Layers2 size={15}/> Plan</button>
      </div>
      {ready && props.scene.option && !props.editing && !props.touring && <div className="sun-tool"><button type="button" className="sun-toggle" aria-pressed={solarHour!==null} onClick={()=>setSun(s=>s===null?9:null)}><Sun size={15}/> Sun study</button>
        {solarHour!==null && <div className="sun-pop"><strong>{props.scene.cutFloor?'Cutaway':'Proposal'} shadow</strong><div role="group" aria-label="Solar time">{[9,12,15].map(h=><button type="button" key={h} aria-pressed={solarHour===h} onClick={()=>setSun(h)}>{h===12?'Noon':h===9?'9 am':'3 pm'}</button>)}</div><small>Equinox · solar time · flat ground</small></div>}</div>}
      <button type="button" className="map-button" disabled={!ready} aria-label="Reset north bearing" title="Reset north bearing" onClick={() => map.current?.easeTo({ bearing: 0, duration: 280 })}><span ref={compass}><Compass size={20} /></span></button>
    </div>
    <div className="map-tools">
      <div className="zoom-set">
        <button type="button" className="map-button" disabled={!ready} aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={19}/></button>
        <button type="button" className="map-button" disabled={!ready} aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={19}/></button>
      </div>
      <button type="button" className="map-button" disabled={!ready} aria-label="Center on parcel" title="Center on parcel" onClick={() => map.current?.easeTo({ center: meanPoint(props.scene.ring.length ? props.scene.ring : EXAMPLES[0].ring), zoom: props.editing?18.65:VIEW_ZOOM, duration: 330 })}><Focus size={18} /></button>
    </div>
    <div className="map-bottom">
      <div className="map-key">
        <span><i className="key-proposal" />{props.scene.preview ? 'Last valid preview' : 'Concept'}</span>
        <span><i className="key-planting" /> Planting</span>
        <span><i className="key-row" /> Assumed ROW</span>
        {props.scene.envelope && <span><i className="key-envelope" /> Envelope</span>}
        {props.scene.comparison && <span><i className="key-dashed" /> Other footprint</span>}
        {props.scene.sectionProbe && <span><i className="key-probe" /> Section probe</span>}
        {Boolean(props.scene.reservation?.length) && <span><i className="key-reservation" /> No-build strip</span>}
        {props.scene.activeScan === 'parking' && Boolean(props.scene.ground?.parking.bays.length) && <span><i className="key-parking" /> Test parking</span>}
        {props.scene.activeScan === 'fire' && Boolean(props.scene.ground?.fire.length) && <span><i className="key-fire" /> Test fire approach</span>}
      </div>
      <div className="map-notice">
        <button type="button" aria-pressed={flat} onClick={() => setFlat(!flat)}>{flat ? 'Show 6 m context' : 'Flatten context'}</button>
        <a href="#data">© OpenStreetMap · Overture · illustrative heights</a>
      </div>
    </div>
  </section>
}
