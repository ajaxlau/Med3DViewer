import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadModel,downloadModel} from '../src/lib/modelUploads';
import {modelIdentity} from '../src/lib/modelIdentity';
const id='a'.repeat(64);
test('bad local 3MF contents are rejected before any upload or model bytes leave the device',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('No network expected');});
 await assert.rejects(uploadModel(new File(['<html>not a model</html>'],'model.3mf'),{signal:new AbortController().signal,capabilities:null,safeMode:true}),/3MF archive/);assert.equal(calls,0);
});
test('client uploads validated local STL bytes only after a credentialed session and verifies private downloads',async t=>{
 const bytes=new Uint8Array(134);new DataView(bytes.buffer).setUint32(80,1,true);const fingerprint=await modelIdentity(bytes.buffer,'dropbox-block-sha256');const asset={id,name:'model.stl',extension:'stl',size:134,modelIdentity:fingerprint,identityKind:'dropbox-block-sha256',createdAt:Date.now()};const paths:string[]=[];
 t.mock.method(globalThis,'fetch',async(path:string,init:RequestInit)=>{paths.push(String(path));assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');
  if(init.method==='POST'&&path==='/api/shares/uploads')return Response.json({id,status:'open',offset:0});
  if(init.method==='PUT'){assert.equal(init.headers['Upload-Offset'],'0');assert.deepEqual(new Uint8Array(await(init.body as Blob).arrayBuffer()),bytes);return Response.json({offset:134});}
  if(path.endsWith('/complete'))return Response.json(asset);
  return new Response(bytes);
 });
 const result=await uploadModel(new File([bytes],'model.stl'),{signal:new AbortController().signal,capabilities:null,safeMode:true});assert.equal(result.modelIdentity,fingerprint);
 const file=await downloadModel(result,undefined,{signal:new AbortController().signal,capabilities:null,safeMode:true});assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);assert.equal(paths.length,4);
});
