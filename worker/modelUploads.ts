import type { ShareEnvironment, ShareDatabase } from './index';
import { readUserSession, requireUserPermission } from './userSessions';
import { dropboxStorageFetch } from './dropboxConnection';
import { MODEL_BLOCK_BYTES, combineModelBlocks, digestHex } from '../src/lib/modelIdentity';
import { randomToken } from './workspaceAccess';
export const MAX_ASSET_BYTES = 150 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
const headers = {'Cache-Control':'no-store','Content-Type':'application/json','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export class ModelAssetError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers});}
export interface ModelAsset {id:string;owner_id:string;connection_epoch:number;filename:string;extension:string;size:number;content_hash:string;file_id:string;file_rev:string;created_at:number}
interface Upload extends ModelAsset {offset:number;block_hashes:string;session_ciphertext:string;target_hash:string|null;target_epoch:number|null;status:string;expires_at:number;lock_at:number}
async function bounded(body:ReadableStream<Uint8Array>|null,limit:number):Promise<Uint8Array>{
 if(!body)throw new ModelAssetError(400,'UPLOAD_INVALID','Empty upload body.');const reader=body.getReader(),chunks:Uint8Array[]=[];let count=0;
 try{for(;;){const part=await reader.read();if(part.done)break;count+=part.value.length;if(count>limit)throw new ModelAssetError(413,'MODEL_TOO_LARGE','Upload chunk is too large.');chunks.push(part.value);}const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
}
async function providerJson(env:ShareEnvironment,route:string,init:RequestInit,upstream:typeof fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30_000);
 try{const response=await dropboxStorageFetch(env,route,{...init,signal:controller.signal},upstream);
  if(!response.ok){await response.body?.cancel();throw new ModelAssetError(502,'UPLOAD_PROVIDER','Dropbox could not complete this upload. Retry or reconnect.');}
  return JSON.parse(new TextDecoder().decode(await bounded(response.body,64*1024)));
 }finally{clearTimeout(timer);}
}
function args(value:unknown){return {'Dropbox-API-Arg':JSON.stringify(value),'Content-Type':'application/octet-stream'};}
async function uploadKey(env:ShareEnvironment){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Med3D upload session v1\0'+env.DROPBOX_CREDENTIALS_KEY)),'AES-GCM',false,['encrypt','decrypt']);}
async function sessionCipher(value:string,env:ShareEnvironment,id:string,decode=false):Promise<string>{
 const enc=new TextEncoder(),aad=enc.encode(env.SHARES_ENVIRONMENT+'\0'+id);
 if(decode){const [iv,data]=value.split('.');if(!/^[a-f0-9]{24}$/.test(iv||'')||!/^[a-f0-9]{32,8192}$/.test(data||''))throw new Error('Invalid session');const bytes=(s:string)=>new Uint8Array(s.match(/../g)!.map(b=>parseInt(b,16)));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:aad},await uploadKey(env),bytes(data)));}
 const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await uploadKey(env),enc.encode(value));
 const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b as ArrayBuffer),v=>v.toString(16).padStart(2,'0')).join('');return hex(iv)+'.'+hex(data);
}
async function ready(env:ShareEnvironment){const version=await env.SHARES_DB!.prepare('SELECT version FROM share_schema_version WHERE id=1').first<{version:number}>();if((version?.version||0)<7)throw new ModelAssetError(503,'UPGRADE_REQUIRED','Apply migration 0007 to enable model uploads.');}
async function connectionEpoch(env:ShareEnvironment){const row=await env.SHARES_DB!.prepare("SELECT epoch,status FROM dropbox_connection WHERE id=1").first<{epoch:number;status:string}>();if(!row||!['connected','refreshing'].includes(row.status))throw new ModelAssetError(409,'UPLOAD_PROVIDER','Connect Dropbox before uploading models.');return row.epoch;}
async function workspace(env:ShareEnvironment,token:string,now:number,edit=false){
 if(!HEX.test(token))throw new ModelAssetError(404,'SHARE_UNAVAILABLE','Workspace unavailable.');const hash=await digestHex(new TextEncoder().encode(token));
 const row=await env.SHARES_DB!.prepare('SELECT token_hash,include_workspace,editing_enabled,auth_epoch FROM shares WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').bind(hash,now).first<any>();
 if(!row||!row.include_workspace)throw new ModelAssetError(404,'SHARE_UNAVAILABLE','Workspace unavailable.');if(edit&&!row.editing_enabled)throw new ModelAssetError(403,'VIEW_ONLY','Workspace editing is disabled.');return row;
}
export async function assetById(env:ShareEnvironment,id:string):Promise<ModelAsset>{
 if(!HEX.test(id))throw new ModelAssetError(404,'MODEL_UNAVAILABLE','Model unavailable.');const row=await env.SHARES_DB!.prepare('SELECT * FROM model_assets WHERE id=?').bind(id).first<ModelAsset>();if(!row)throw new ModelAssetError(404,'MODEL_UNAVAILABLE','Model unavailable.');return row;
}
export function publicAsset(asset:ModelAsset){return {id:asset.id,name:asset.filename,extension:asset.extension,size:asset.size,modelIdentity:asset.content_hash,identityKind:'dropbox-block-sha256',createdAt:asset.created_at};}
export async function requireOwnedAsset(request:Request,env:ShareEnvironment,id:string,now:number){const user=await readUserSession(request,env,now);requireUserPermission(user,'workspace:share');const asset=await assetById(env,id);if(asset.owner_id!==user.id)throw new ModelAssetError(403,'PERMISSION_REQUIRED','This model is not in your uploads.');return asset;}
export async function requireAttachedAsset(env:ShareEnvironment,hash:string,id:string){const asset=await assetById(env,id);if(!await env.SHARES_DB!.prepare('SELECT asset_id FROM workspace_models WHERE token_hash=? AND asset_id=?').bind(hash,id).first())throw new ModelAssetError(403,'MODEL_UNAVAILABLE','This model is not attached to the workspace.');return asset;}
function validateFirst(bytes:Uint8Array,upload:Upload){
 if(upload.extension==='3mf'){if(bytes.length<4||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)throw new ModelAssetError(400,'UPLOAD_FORMAT','A 3MF must be a valid ZIP container.');}
 else{const text=new TextDecoder().decode(bytes.subarray(0,1024)).trimStart();const binary=bytes.length>=84&&84+new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true)*50===upload.size;if(!binary&&!/^solid\b[\s\S]*\bfacet\b/i.test(text))throw new ModelAssetError(400,'UPLOAD_FORMAT','The selected file is not a valid STL model.');}
}
export async function handleModelUploads(request:Request,env:ShareEnvironment,upstream:typeof fetch,now:number):Promise<Response>{
 await ready(env);const url=new URL(request.url),db=env.SHARES_DB!;
 const catalog=/^\/api\/shares\/([a-f0-9]{64})\/models$/.exec(url.pathname);
 if(catalog&&request.method==='GET'){const ws=await workspace(env,catalog[1],now);const row=await db.prepare("SELECT json_group_array(json_object('id',a.id,'name',a.filename,'extension',a.extension,'size',a.size,'modelIdentity',a.content_hash,'identityKind','dropbox-block-sha256','createdAt',a.created_at)) AS items FROM model_assets a JOIN workspace_models w ON w.asset_id=a.id WHERE w.token_hash=?").bind(ws.token_hash).first<{items:string}>();return json({items:JSON.parse(row?.items||'[]')});}
 const user=await readUserSession(request,env,now);requireUserPermission(user,'workspace:share');
 if(url.pathname==='/api/shares/uploads'&&request.method==='GET'){const row=await db.prepare("SELECT json_group_array(json_object('id',id,'name',filename,'extension',extension,'size',size,'modelIdentity',content_hash,'identityKind','dropbox-block-sha256','createdAt',created_at)) AS items FROM (SELECT * FROM model_assets WHERE owner_id=? ORDER BY created_at DESC LIMIT 50)").bind(user.id).first<{items:string}>();return json({items:JSON.parse(row?.items||'[]')});}
 if(url.pathname==='/api/shares/uploads'&&request.method==='POST'){
  const body=JSON.parse(new TextDecoder().decode(await bounded(request.body,2048)));const ext=typeof body.filename==='string'?body.filename.toLowerCase().split('.').pop():'';
  if(!['stl','3mf'].includes(ext)||typeof body.filename!=='string'||body.filename.length>128||/[\u0000-\u001f/\\]/.test(body.filename)||!Number.isSafeInteger(body.size)||body.size<1||body.size>MAX_ASSET_BYTES||!HEX.test(body.requestKey||''))throw new ModelAssetError(400,'UPLOAD_INVALID','Choose a valid STL or 3MF of at most 150 MiB.');
  const existing=await db.prepare('SELECT id,status,offset FROM model_uploads WHERE owner_id=? AND request_key=?').bind(user.id,body.requestKey).first<any>();if(existing)return json(existing);
  const target=body.workspaceToken?await workspace(env,body.workspaceToken,now,true):null,epoch=await connectionEpoch(env),id=randomToken();
  const result=await db.prepare(`INSERT INTO model_uploads(id,owner_id,request_key,connection_epoch,filename,extension,size,target_hash,target_epoch,status,created_at,expires_at)
   SELECT ?,?,?,?,?,?,?,?,?,'starting',?,? WHERE (SELECT COUNT(*) FROM model_uploads WHERE owner_id=? AND status IN ('starting','open','sending','finalizing') AND expires_at>?)<5
   AND (SELECT COUNT(*) FROM model_uploads WHERE expires_at>?)<500
   AND (SELECT COUNT(*) FROM model_uploads WHERE owner_id=? AND created_at>?)<20
   AND (SELECT COUNT(*) FROM model_assets)<100
   AND COALESCE((SELECT SUM(size) FROM model_assets),0)+COALESCE((SELECT SUM(size) FROM model_uploads WHERE status IN ('starting','open','sending','finalizing') AND expires_at>?),0)+?<=536870912`)
   .bind(id,user.id,body.requestKey,epoch,body.filename,ext,body.size,target?.token_hash||null,target?.auth_epoch||null,now,now+3600_000,user.id,now,now,user.id,now-86400000,now,body.size).run();
  if(!result.meta?.changes)throw new ModelAssetError(429,'UPLOAD_QUOTA','Test upload storage/session quota reached.');
  try{const started=await providerJson(env,'upload_session/start',{headers:args({close:false}),body:new Uint8Array()},upstream);if(typeof started.session_id!=='string'||started.session_id.length>2048)throw new Error('Invalid session');
   await db.prepare("UPDATE model_uploads SET session_ciphertext=?,status='open' WHERE id=? AND status='starting'").bind(await sessionCipher(started.session_id,env,id),id).run();return json({id,status:'open',offset:0},201);
  }catch(e){await db.prepare("UPDATE model_uploads SET status='failed' WHERE id=?").bind(id).run();throw e;}
 }
 const route=/^\/api\/shares\/uploads\/([a-f0-9]{64})(?:\/(complete))?$/.exec(url.pathname);
 if(!route)throw new ModelAssetError(404,'MODEL_UNAVAILABLE','Upload unavailable.');
 const id=route[1],upload=await db.prepare('SELECT * FROM model_uploads WHERE id=? AND owner_id=?').bind(id,user.id).first<Upload>();
 if(!upload||upload.expires_at<=now)throw new ModelAssetError(404,'MODEL_UNAVAILABLE','Upload expired or unavailable.');
 if(request.method==='DELETE'){await db.prepare("UPDATE model_uploads SET status='cancelled' WHERE id=? AND status<>'ready'").bind(id).run();return json({cancelled:true});}
 if(upload.connection_epoch!==await connectionEpoch(env))throw new ModelAssetError(409,'UPLOAD_CHANGED','Dropbox connection changed; start a new upload.');
 if(upload.target_hash){const current=await db.prepare('SELECT auth_epoch FROM shares WHERE token_hash=? AND editing_enabled=1 AND include_workspace=1 AND expires_at>? AND revoked_at IS NULL').bind(upload.target_hash,now).first<{auth_epoch:number}>();if(current?.auth_epoch!==upload.target_epoch)throw new ModelAssetError(403,'VIEW_ONLY','Workspace permissions changed.');}
 if(route[2]==='complete'&&request.method==='POST'){
  if(upload.status==='ready')return json(publicAsset(await assetById(env,id)));
  if(upload.offset!==upload.size||!['open','finalizing'].includes(upload.status))throw new ModelAssetError(409,'UPLOAD_OFFSET','The upload is incomplete or busy.');
  if(upload.status==='finalizing'&&(upload.lock_at||0)>now-60_000)throw new ModelAssetError(409,'UPLOAD_BUSY','Finishing the upload. Retry after one minute.');
  const lock=randomToken();const claim=await db.prepare("UPDATE model_uploads SET status='finalizing',lock_id=?,lock_at=? WHERE id=? AND status=? AND COALESCE(lock_at,0)=? RETURNING id").bind(lock,now,id,upload.status,upload.lock_at||0).first();if(!claim)throw new ModelAssetError(409,'UPLOAD_BUSY','Upload is busy.');
  const hash=await combineModelBlocks(JSON.parse(upload.block_hashes)),path=`/${id}.${upload.extension}`;
  let meta:any;
  try{if(upload.status==='finalizing')meta=await providerJson(env,'get_metadata',{headers:{'Content-Type':'application/json'},body:JSON.stringify({path})},upstream);
   else meta=await providerJson(env,'upload_session/finish',{headers:args({cursor:{session_id:await sessionCipher(upload.session_ciphertext,env,id,true),offset:upload.size},commit:{path,mode:'add',autorename:false,mute:true,strict_conflict:true}}),body:new Uint8Array()},upstream);
  }catch{try{meta=await providerJson(env,'get_metadata',{headers:{'Content-Type':'application/json'},body:JSON.stringify({path})},upstream);}catch{throw new ModelAssetError(502,'UPLOAD_FINISH','Dropbox completion is not confirmed. Retry completion after one minute.');}}
  if(meta.content_hash!==hash||meta.size!==upload.size||meta.path_lower!==path||typeof meta.id!=='string'||!/^id:[A-Za-z0-9_-]{1,128}$/.test(meta.id)||typeof meta.rev!=='string'||!/^[a-f0-9]{1,64}$/.test(meta.rev))throw new ModelAssetError(502,'UPLOAD_IDENTITY','Dropbox model verification failed.');
  if(upload.connection_epoch!==await connectionEpoch(env))throw new ModelAssetError(409,'UPLOAD_CHANGED','Dropbox connection changed.');
  const currentUser=await readUserSession(request,env,now);requireUserPermission(currentUser,'workspace:share');if(currentUser.id!==user.id||currentUser.version!==user.version)throw new ModelAssetError(403,'PERMISSION_REQUIRED','Your account access changed.');
  const results=await db.batch([
   db.prepare(`INSERT OR IGNORE INTO model_assets(id,owner_id,connection_epoch,filename,extension,size,content_hash,file_id,file_rev,created_at)
    SELECT id,owner_id,connection_epoch,filename,extension,size,?,?,?,? FROM model_uploads WHERE id=? AND status='finalizing' AND lock_id=? AND EXISTS(SELECT 1 FROM share_users WHERE id=? AND active=1 AND updated_at=?)`)
    .bind(hash,meta.id,meta.rev,now,id,lock,user.id,user.version),
   db.prepare(`INSERT OR IGNORE INTO workspace_models(token_hash,asset_id) SELECT s.token_hash,? FROM shares s WHERE s.token_hash=? AND s.auth_epoch=? AND s.include_workspace=1 AND s.editing_enabled=1 AND s.expires_at>? AND s.revoked_at IS NULL AND EXISTS(SELECT 1 FROM model_assets WHERE id=?)`).bind(id,upload.target_hash,upload.target_epoch,now,id),
   db.prepare("UPDATE model_uploads SET status='ready',session_ciphertext=NULL WHERE id=? AND lock_id=? AND status='finalizing' AND EXISTS(SELECT 1 FROM model_assets WHERE id=?)").bind(id,lock,id),
  ]);
  if(!results[2]?.meta?.changes)throw new ModelAssetError(409,'UPLOAD_CHANGED','The upload state changed.');if(upload.target_hash&&!results[1]?.meta?.changes)throw new ModelAssetError(403,'VIEW_ONLY','The model was uploaded, but workspace permissions changed before attachment.');return json(publicAsset(await assetById(env,id)));
 }
 if(request.method==='PUT'&&!route[2]){
  const offset=Number(request.headers.get('Upload-Offset'));if(!request.headers.has('Upload-Offset')||!Number.isSafeInteger(offset)||offset<0||offset!==upload.offset)throw new ModelAssetError(409,'UPLOAD_OFFSET','The upload position changed.');
  if(upload.status!=='open')throw new ModelAssetError(409,'UPLOAD_BUSY','Upload is busy or failed.');
  const bytes=await bounded(request.body,MODEL_BLOCK_BYTES);if(bytes.length!==Math.min(MODEL_BLOCK_BYTES,upload.size-offset)||!bytes.length)throw new ModelAssetError(400,'UPLOAD_OFFSET','Invalid chunk length.');if(!offset)validateFirst(bytes,upload);
  const lock=randomToken(),claimed=await db.prepare("UPDATE model_uploads SET status='sending',lock_id=?,lock_at=? WHERE id=? AND status='open' AND offset=? RETURNING id").bind(lock,now,id,offset).first();if(!claimed)throw new ModelAssetError(409,'UPLOAD_BUSY','Upload is busy.');
  try{await providerJson(env,'upload_session/append_v2',{headers:args({cursor:{session_id:await sessionCipher(upload.session_ciphertext,env,id,true),offset},close:false}),body:bytes},upstream);
   const hashes=JSON.parse(upload.block_hashes);hashes.push(await digestHex(bytes));const saved=await db.prepare("UPDATE model_uploads SET offset=?,block_hashes=?,status='open',lock_id=NULL WHERE id=? AND lock_id=? AND status='sending'").bind(offset+bytes.length,JSON.stringify(hashes),id,lock).run();if(!saved.meta?.changes)throw new ModelAssetError(409,'UPLOAD_CHANGED','Upload was cancelled.');return json({offset:offset+bytes.length});
  }catch(e){await db.prepare("UPDATE model_uploads SET status='failed' WHERE id=? AND lock_id=? AND status='sending'").bind(id,lock).run();throw e;}
 }
 throw new ModelAssetError(405,'METHOD_NOT_ALLOWED','Unsupported upload operation.');
}
export async function streamAsset(asset:ModelAsset,request:Request,env:ShareEnvironment,upstream:typeof fetch):Promise<Response>{
 const safeHeaders={'Cache-Control':'no-store','Content-Type':asset.extension==='3mf'?'model/3mf':'model/stl','Content-Length':String(asset.size),'Content-Disposition':`inline; filename="model.${asset.extension}"`,'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
 if(request.method==='HEAD')return new Response(null,{headers:safeHeaders});
 const controller=new AbortController();let timer:any=setTimeout(()=>controller.abort(),30_000);const clear=()=>clearTimeout(timer);
 let response:Response;try{response=await dropboxStorageFetch(env,'download',{headers:args({path:asset.file_id,rev:asset.file_rev}),signal:controller.signal},upstream);}catch(e){clear();throw e;}
 if(!response.ok){clear();await response.body?.cancel();throw new ModelAssetError(502,'MODEL_UNAVAILABLE','Dropbox model is unavailable.');}
 let meta:any;try{const value=response.headers.get('Dropbox-API-Result')||'';if(value.length>16384)throw new Error();meta=JSON.parse(value);}catch{clear();await response.body?.cancel();throw new ModelAssetError(502,'MODEL_UNAVAILABLE','Dropbox model metadata is unavailable.');}
 if(meta.id!==asset.file_id||meta.rev!==asset.file_rev||meta.content_hash!==asset.content_hash||meta.size!==asset.size||!response.body){clear();await response.body?.cancel();throw new ModelAssetError(409,'MODEL_CHANGED','The stored model changed.');}
 const reader=response.body.getReader();let received=0;
 const stream=new ReadableStream<Uint8Array>({async pull(output){try{const part=await reader.read();if(part.done){clear();if(received!==asset.size)throw new Error('Truncated model');output.close();return;}received+=part.value.length;if(received>asset.size||received>MAX_ASSET_BYTES)throw new Error('Model limit');clear();timer=setTimeout(()=>controller.abort(),30_000);output.enqueue(part.value);}catch{clear();controller.abort();await reader.cancel().catch(()=>{});output.error(new Error('Model download interrupted.'));}},async cancel(){clear();controller.abort();await reader.cancel().catch(()=>{});}});
 return new Response(stream,{headers:safeHeaders});
}
