import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSharedMeshState, matchSharedMeshState } from '../src/lib/sharedMeshState';
import { validateSharedWorkspace } from '../src/lib/planningData';
import { ViewerManager } from '../src/lib/ViewerManager';

const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function scene(){
  const root:any={children:[],matrixWorld:{toArray:()=>matrix},updateMatrixWorld(){}};
  const meshes=[false,true].map((visible,index)=>({name:'Duplicate name',visible,material:{opacity:index?0.5:0},geometry:{attributes:{position:{count:3}},index:{count:3}},parent:root}));
  root.children=meshes;return{root,meshes};
}
function snapshot(meshes:any[]){return{schemaVersion:2,modelMatrix:matrix,coordinateSystem:{systemType:'Viewer world with recorded model root',units:'millimeters (mm)'},objects:[],groups:[],meshes};}
test('per-instance paths preserve hidden meshes and zero opacity even when names/geometry repeat',()=>{
  const {root,meshes}=scene();const result=captureSharedMeshState(meshes,root);
  assert.deepEqual(result.map(row=>[row.key,row.visible,row.opacity]),[['0',false,0],['1',true,0.5]]);
  assert.deepEqual(validateSharedWorkspace(snapshot(result)).meshes,result);
  assert(!JSON.stringify(result).includes('vertices":['));
});
test('changed mesh paths/counts fail closed instead of applying visibility to another object',()=>{
  const {root,meshes}=scene();const saved=captureSharedMeshState(meshes,root);
  assert.throws(()=>matchSharedMeshState(saved,saved.slice(1)),/layout differs/);
  assert.throws(()=>matchSharedMeshState(saved,[{...saved[0],vertices:99},saved[1]]),/layout differs/);
  assert.throws(()=>validateSharedWorkspace(snapshot([saved[0],saved[0]])),/unique/);
  assert.throws(()=>validateSharedWorkspace(snapshot([{...saved[0],fileDataURL:'data:model'}])),/unsupported/);
});
test('the viewer restores multi-mesh visibility/opacity and publishes matching sidebar state',async()=>{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{THREE:{Matrix4:class{toArray(){return matrix;}}}}});
  const {root,meshes}=scene();const saved=captureSharedMeshState(meshes,root);
  meshes.forEach(mesh=>{mesh.visible=true;mesh.material.opacity=1;});
  const manager:any=Object.create(ViewerManager.prototype);let sidebar:any[]=[];let renders=0;
  Object.assign(manager,{viewer:{viewer:{Render(){renders++;}}},loadedFilename:'synthetic.3mf',currentMeshes:meshes,planningObjects:[],planningGroups:[],nextPlanningObjectId:1,
    getModelRoot:()=>root,clearAllPlanningObjects(){this.planningObjects=[];},notifyGroupsChanged(){},config:{onMeshesChange:(rows:any[])=>{sidebar=rows;}}});
  await manager.restoreShareWorkspace(snapshot(saved));
  assert.deepEqual(meshes.map(mesh=>[mesh.visible,mesh.material.opacity]),[[false,0],[true,0.5]]);
  assert.deepEqual(sidebar.map(row=>[row.id,row.visible,row.opacity]),[[0,false,0],[1,true,0.5]]);
  assert.equal(manager.readOnlySharedWorkspace,true,'shared edits must not enter filename-keyed localStorage');
  assert.equal(renders,1,'mesh restoration must batch rendering for mobile GPUs');
});
test('a cancelled shared package never reaches the model parser or scene replacement',async()=>{
  const manager:any=Object.create(ViewerManager.prototype);let imports=0;
  Object.assign(manager,{modelLoadState:{},config:{onStatusChange(){},onProgressChange(){}},viewer:{LoadModelFromFileList(){imports++;}},resetWorkspace(){throw new Error('Cancelled packages must not replace the current scene');}});
  const controller=new AbortController();controller.abort();
  await manager.loadFiles([new File(['PK synthetic'],'synthetic.3mf')],{shared:true,signal:controller.signal});
  assert.equal(imports,0);assert.equal(manager.modelLoadState.phase,'cancelled');
});
