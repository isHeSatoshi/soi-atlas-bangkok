import { expect, test } from 'vitest'
import { area, type Shape } from '../src/domain/geo'
import { shadowVector, castShadow } from '../src/map/shadow'
import { sceneData, type Scene } from '../src/map/scene'
import { solve } from '../src/domain/solve'
import { toWorld, type Ring } from '../src/domain/geo'

test('a vertical pole at the equator has a westward shadow at 9 solar hours and none at equinox noon',()=>{
  expect(shadowVector(0,9)[0]).toBeCloseTo(-1,8)
  expect(shadowVector(0,12)).toEqual([0,0])
  expect(shadowVector(0,15)[0]).toBeCloseTo(1,8)
  expect(shadowVector(13.785,12)[1]).toBeCloseTo(.2453,3)
})
test('prism shadow includes walls, not only the translated roof; noon preserves a courtyard',()=>{
  const polygon:Shape=[[[[0,0],[10,0],[10,10],[0,10]]]]
  const floors=[{polygon,baseM:0,topM:3},{polygon,baseM:3,topM:6}]
  expect(area(castShadow(floors,[-1,0]))).toBe(160)
  expect(area(castShadow(floors.slice(0,1),[-1,0]))).toBe(130)
  expect(area(castShadow([{baseM:0,topM:3,polygon:[[polygon[0][0],[[3,3],[3,7],[7,7],[7,3]]]]}],[0,0]))).toBe(84)
})
test('map cut removes all upper geometry without changing the measured total',()=>{
  const plot:Ring=[[0,0],[22,0],[22,16],[17,16],[17,22],[0,22]]
  const frontage={a:plot[0],b:plot[1],wayId:1}
  const result=solve({plot,frontage,program:'multifamily',rowWidthM:6})
  const option=result.options[0]
  expect(option.floors.length).toBeGreaterThan(2)
  const scene:Scene={ring:plot.map(toWorld),valid:true,option,frontage,width:6,roadId:1,envelope:false,slices:option.slices,level:2,rule:null,editing:false,edgeChoices:[],cutFloor:2}
  const data=sceneData(scene,undefined,9)
  for(const k of ['floor','joint','sill']){
    expect(data.features.filter(f=>f.properties?.kind===k).map(f=>f.properties?.level)).toEqual([1,2])
  }
  expect(data.features.filter(f=>f.properties?.kind==='shadow')).toHaveLength(1)
  expect(option.floors.length).toBeGreaterThan(2)
})
