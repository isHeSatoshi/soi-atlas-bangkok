import { union, type Point, type Shape } from '../domain/geo'
import type { Floor } from '../domain/evaluate'

// Equinox, apparent local solar time, flat receiving plane. This is a
// drawing aid, not a daylight compliance or neighboring-window assessment.
export function shadowVector(latitude: number, hour: number):Point {
  const lat=latitude*Math.PI/180, h=(hour-12)*Math.PI/12
  return [Math.tan(h)/Math.cos(lat),Math.tan(lat)]
}
export function castShadow(floors:Floor[], v:Point):Shape {
  const faces:Shape=[]
  const shift=(p:Point,z:number):Point=>[p[0]+z*v[0],p[1]+z*v[1]]
  for(const {polygon,baseM,topM} of floors) for(const poly of polygon) {
    faces.push(poly.map(r=>r.map(p=>shift(p,topM))),poly.map(r=>r.map(p=>shift(p,baseM))))
    for(const ring of poly) ring.forEach((a,i)=>{
      const b=ring[(i+1)%ring.length]
      faces.push([[shift(a,baseM),shift(b,baseM),shift(b,topM),shift(a,topM)]])
    })
  }
  return union(faces)
}
