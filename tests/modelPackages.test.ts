import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { validate3mfPackage, validateGlbPackage } from '../src/lib/modelPackages';
import { getDeviceLoadProfile, validateLocalFiles } from '../src/lib/modelLoading';

const profile=getDeviceLoadProfile(null,true);
const model='<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter"><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object><object id="2"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></components></object></resources><build><item objectid="1"/><item objectid="2"/></build></model>';
async function packageFile(xml=model,extras:Record<string,string>={}) {
  const zip=new JSZip();zip.file('3D/3dmodel.model',xml);zip.file('[Content_Types].xml','<Types/>');zip.file('_rels/.rels','<Relationships><Relationship Target="/3D/3dmodel.model"/></Relationships>');
  for(const [path,value]of Object.entries(extras))zip.file(path,value);
  return new File([await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],'synthetic.3mf');
}
function glb(json:any) {
  const text=new TextEncoder().encode(JSON.stringify(json));const length=Math.ceil(text.length/4)*4;
  const bytes=new Uint8Array(20+length);bytes.fill(32,20);bytes.set(text,20);const header=new DataView(bytes.buffer);
  header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,bytes.length,true);header.setUint32(12,length,true);header.setUint32(16,0x4e4f534a,true);
  return new File([bytes],'synthetic.glb');
}
test('a self-contained multi-object 3MF package passes bounded preflight and ordinary file validation',async()=>{
  const file=await packageFile();await validate3mfPackage(file,profile);
  assert.equal((await validateLocalFiles([file],profile)).primaryName,'synthetic.3mf');
});
test('3MF external relationships, texture paths, entities and unsafe filenames are rejected',async()=>{
  for(const xml of [
    model.replace('<resources>','<!DOCTYPE model [<!ENTITY expand "boom">]><resources>'),
    model.replace('<resources>','<resources><texture2d path="https://attacker.example/private.png"/>'),
    model.replace('<resources>','<resources><texture2d path="http&#58;//attacker.example/private.png"/>'),
    model.replace('<resources>','<resources><texture2d path="%68%74%74%70%73%3A%2F%2Fattacker.example/x"/>'),
  ])await assert.rejects(validate3mfPackage(await packageFile(xml),profile));
  await assert.rejects(validate3mfPackage(await packageFile(model,{'_rels/external.rels':'<Relationship Target="/safe" TargetMode="External"/>'}),profile),/External/);
  await assert.rejects(validate3mfPackage(await packageFile(model,{'../unsafe.bin':'binary'}),profile),/unsafe/);
});
test('actual expanded bytes stop forged-small 3MF XML before the viewer parser can allocate it',async()=>{
  const file=await packageFile(model+' '.repeat(100_000));const bytes=new Uint8Array(await file.arrayBuffer());const view=new DataView(bytes.buffer);
  for(let i=0;i<bytes.length-30;i++)if(view.getUint32(i,true)===0x02014b50)view.setUint32(i+24,1,true);
  await assert.rejects(validate3mfPackage(new Blob([bytes]),{...profile,hardLimitBytes:1024}),/limit/);
});
test('3MF preflight honours cancellation and rejects oversized resource paths across stream chunks',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(validate3mfPackage(await packageFile(),profile,controller.signal),error=>(error as Error).name==='AbortError');
  await assert.rejects(validate3mfPackage(await packageFile(model.replace('<resources>','<resources><texture2d path="'+ 'a'.repeat(20_000)+'https://attacker.example/x"/>')),profile),/resource path|unsafe/);
});
test('protected GLB metadata permits embedded resources and refuses external buffers/textures',async()=>{
  await validateGlbPackage(glb({asset:{version:'2.0'},buffers:[{byteLength:0}],images:[{bufferView:0,mimeType:'image/png'}]}),profile);
  await assert.rejects(validateGlbPackage(glb({asset:{version:'2.0'},buffers:[{uri:'https://attacker.example/private.bin'}]}),profile),/embedded/);
  await assert.rejects(validateGlbPackage(glb({asset:{version:'2.0'},images:[{uri:'https://attacker.example/private.png'}]}),profile),/embedded/);
  await assert.rejects(validateGlbPackage(new Blob(['not a GLB']),profile));
  const external=glb({asset:{version:'2.0'},buffers:[{uri:'companion.bin'}]});
  assert.equal((await validateLocalFiles([external],profile)).protectedShareable,false,'ordinary companion loading must remain available');
  await assert.rejects(validateLocalFiles([external],profile,{requireSelfContained:true}),/embedded/);
});

test('a mislabeled 3MF download reports model-specific guidance rather than planning ZIP instructions',async()=>{
 const file=new File(['<!doctype html><title>Download page</title>'],'synthetic.3mf');
 await assert.rejects(validateLocalFiles([file],profile),(error:any)=>error.code==='FORMAT_MISMATCH'&&/3MF archive/.test(error.message)&&!/planning bundle/.test(error.workaround||''));
});
