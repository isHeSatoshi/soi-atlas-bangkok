import { memo, useRef, useState } from 'react'
import { Check, Download, Scissors } from 'lucide-react'
import { CONCEPT } from '../domain/concepts'
import type { Frame, Point, Ring, Shape } from '../domain/geo'
import type { Option } from '../domain/solve'
import { fmt } from './Inspector'
import type { Restriction } from './Diligence'

// Orthographic projection in the street's frame. Use the same plot and vertical
// extent for both options so a shorter building really looks shorter.
export const Axon = memo(function Axon({ option, plot, frame, ceiling }: { option: Option; plot: Ring; frame: Frame; ceiling: number }) {
  const project = (p: Point, z: number): Point => {
    const [s,d] = frame.into(p)
    return [.87*s + .66*d, .38*s - .53*d - z]
  }
  const corners = plot.flatMap(p => [project(p,0),project(p,ceiling)])
  const xx = corners.map(p=>p[0]), yy = corners.map(p=>p[1])
  const minX=Math.min(...xx), minY=Math.min(...yy), w=Math.max(...xx)-minX, h=Math.max(...yy)-minY
  const coord = (p:Point,z:number) => project(p,z).map(x=>x.toFixed(3)).join(',')
  const path = (shape:Shape,z:number) => shape.flatMap(poly=>poly.map(r=>
    r.map((p,i)=>`${i?'L':'M'}${coord(p,z)}`).join(' ')+'Z')).join(' ')
  return <svg viewBox={`${minX-1.5} ${minY-1.5} ${w+3} ${h+3}`} aria-hidden="true" className="axon" strokeLinejoin="round" fillRule="evenodd">
    <path d={path([[plot]],0)} fill="#e7e4d5" stroke="#96998b" strokeWidth=".17"/>
    <path d={path(option.plantedGeometry,0)} fill="#a1b58d"/>
    {option.floors.map((fl,i)=>{
      const faces=fl.polygon.flatMap(poly=>poly.flatMap(r=>r.map((a,j)=>{
        const b=r[(j+1)%r.length], aa=frame.into(a),bb=frame.into(b)
        return {depth:(aa[0]+bb[0])*.66-(aa[1]+bb[1])*.87, shade:Math.abs(bb[0]-aa[0])>Math.abs(bb[1]-aa[1])?'#b4613f':'#d18a60',
          points:`${coord(a,fl.baseM)} ${coord(b,fl.baseM)} ${coord(b,fl.topM)} ${coord(a,fl.topM)}`}
      }))).sort((a,b)=>a.depth-b.depth)
      return <g key={i}>{faces.map((face,j)=><polygon key={j} points={face.points} fill={face.shade} stroke="#985a3e" strokeWidth=".11"/>)}
        <path d={path(fl.polygon,fl.topM)} fill="#efb88a" stroke="#9a6043" strokeWidth=".16"/></g>
    })}
  </svg>
})

export function ModelRail({option,selected,onCut,locked}:{option?:Option; selected:number|null; onCut:(floor:number|null)=>void; locked:boolean}) {
  const floor=selected!=null ? option?.floors[selected-1] : null
  return <div className="model-rail">
    <div className="model-caption"><span className="sheet-code">{option ? `MODEL ${CONCEPT[option.kind].letter}` : 'SITE MODEL'}</span>
      <strong>{option ? CONCEPT[option.kind].name : 'Parcel study'}</strong>
      <span>{option ? `${fmt(option.h)} m high · ${option.floors.length} floors` : 'No active design'}</span>
    </div>
    {option && <div className="cut-control">
      <div className="cut-label"><span><Scissors size={13}/> Floor cutaway</span>
        <output>{floor ? `F${selected} · ${fmt(floor.areaM2)} m²` : 'Full model'}</output></div>
      <div className="cut-buttons" role="group" aria-label="Cut model at floor">
        {option.floors.map((_,i)=><button key={i} type="button" disabled={locked} aria-label={`Cut at floor ${i+1}`} aria-pressed={selected===i+1} onClick={()=>onCut(selected===i+1?null:i+1)}>{i+1}</button>)}
        <button type="button" disabled={locked} aria-label="Restore full model" aria-pressed={!floor} onClick={()=>onCut(null)}>All</button>
      </div>
    </div>}
  </div>
}

export function DrawingDownload({options,plot,frame,site,area,width,program,assumed,reservation}:{
  options:Option[]; plot:Ring; frame:Frame; site:string; area:number; width:number; program:string; assumed:boolean; reservation: Restriction
}) {
  const ref=useRef<SVGSVGElement>(null),[saved,setSaved]=useState(false)
  const height=Math.max(...options.map(o=>o.h)), rows=Math.ceil(options.length/2), footer=600+(rows-1)*430, sheetHeight=footer+110
  function download(){
    if(!ref.current)return
    const blob=new Blob([new XMLSerializer().serializeToString(ref.current)],{type:'image/svg+xml;charset=utf-8'})
    const url=URL.createObjectURL(blob), a=document.createElement('a')
    a.href=url; a.download=`soi-atlas-${site.split(' ').at(-1)?.replace(/\W/g,'-')}-${program.toLowerCase()}-study.svg`
    document.body.appendChild(a);a.click();a.remove()
    setSaved(true);window.setTimeout(()=>URL.revokeObjectURL(url),30000)
  }
  return <><button type="button" className="sheet-download" onClick={download} title="Download a vector drawing of these evaluated concepts">
      {saved?<Check size={15}/>:<Download size={15}/>} {saved?'Download again':'Download drawing'}</button>
    <div hidden><svg ref={ref} width="1000" height={sheetHeight} viewBox={`0 0 1000 ${sheetHeight}`} xmlns="http://www.w3.org/2000/svg" fontFamily="Arial, sans-serif" fill="#1d3336">
      <title>{site} | Concept comparison</title><desc>Same-scale massing drawings generated from the evaluated floor polygons. Dimensions in metres.</desc>
      <rect width="1000" height={sheetHeight} fill="#faf8ef"/><rect width="1000" height="40" fill="#183436"/>
      <text x="30" y="26" fill="white" fontSize="15" letterSpacing="2">SOI ATLAS  /  BANGKOK</text>
        <text x="970" y="26" fill="white" fontSize="13" textAnchor="end">PARCEL STUDY   /   {options.length} {options.length===1?'CONCEPT':'CONCEPTS'}</text>
      <text x="30" y="97" fontFamily="Georgia, serif" fontSize="43">{site}</text>
      <text x="32" y="127" fontSize="16">Saphan Sung · ย.3–36 · {program} · {fmt(area,2)} m² plot · {fmt(width,2)} m {assumed?'assumed':'user-entered'} public right-of-way</text>
      {reservation.depth > 0 && <text x="32" y="145" fontSize="12">Scenario: {fmt(reservation.depth,2)} m rear no-build strip ({reservation.kind.toLowerCase()}, user-entered).</text>}
      {options.map((o,i)=><g key={o.kind} transform={`translate(${30+(i%2)*480} ${157+Math.floor(i/2)*430})`}>
        <rect width="458" height="410" fill="#f1efe4" stroke="#c9cbbc"/>
        <text x="16" y="31" fontFamily="monospace" fontSize="14">FIG. 0{i+1}  /  {CONCEPT[o.kind].name.toUpperCase()}</text>
        <svg x="48" y="40" width="362" height="212"><Axon option={o} plot={plot} frame={frame} ceiling={height}/></svg>
        <line x1="16" x2="442" y1="264" y2="264" stroke="#b9beae"/>
        <text x="16" y="298" fontSize="26" fontWeight="bold">{fmt(o.gfa,2)} m² gross floor area</text>
        <text x="16" y="328" fontSize="17">{o.floors.length} floors · {fmt(o.h)} m high · {fmt(o.open)} m² open ground</text>
        <text x="16" y="358" fontSize="16">Floor areas (m²), from ground up:</text>
        <text x="16" y="381" fontFamily="monospace" fontSize="15">{o.floors.map(f=>fmt(f.areaM2)).join(' / ')}</text>
      </g>)}
      <text x="32" y={footer} fontSize="17">Fits the modeled rules under your inputs. Pre-architect massing study, not a permit filing.</text>
      <text x="32" y={footer+27} fontSize="14">Sample parcel; check land title, surveyed road width, and zoning before purchase or filing.</text>
      <text x="32" y={footer+51} fontSize="14">Sources: Bangkok Comprehensive Plan B.E. 2556 §10 · BMA Building Control Ordinance §§49-55 · MR 55.</text>
      <text x="32" y={footer+83} fontFamily="monospace" fontSize="12">SOI ATLAS   /   SAPHAN SUNG PLOT STUDY    •    CONCEPT MASSING, NOT FOR CONSTRUCTION</text>
    </svg></div></>
}
