import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createShareWorker,type D1Statement,type ShareEnvironment,hashToken} from '../worker/index';
import {createUserSession} from '../worker/userSessions';
import {modelIdentity,combineModelBlocks,MODEL_BLOCK_BYTES} from '../src/lib/modelIdentity';
import {cleanupExpiredShares} from '../worker/cleanup';
const origin='https://ntec3dpo-m3dv-box-test.x-panda.workers.dev',admin='synthetic-admin-'.repeat(4);
const ws={schemaVersion:1,modelMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],coordinateSystem:{systemType:'Viewer world with recorded model root',units:'millimeters (mm)'},objects:[],groups:[]};
function stl(){const bytes=new Uint8Array(134);new DataView(bytes.buffer).setUint32(80,1,true);return bytes;}
async function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));db.exec("INSERT INTO share_environment(scope) VALUES('box-test')");
 const adapter={prepare(sql:string):D1Statement{let values:any[]=[];return{bind(...args:any[]){values=args;return this;},async first<T>(){return(db.prepare(sql).get(...values)||null)as T;},async run(){const statement=db.prepare(sql);if(/\bRETURNING\b/i.test(sql)){const results=statement.all(...values);return{results,meta:{changes:Number((db.prepare('SELECT changes() n').get()as any).n)}};}return{meta:{changes:Number(statement.run(...values).changes)}};}};},pending:Promise.resolve() as Promise<unknown>,async batch(statements:D1Statement[]){const next=this.pending.then(async()=>{db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}});this.pending=next.catch(()=>{});return next;}};
 let clock=Date.now(),calls=0,failFinish=false,redirect=false;const sessions=new Map<string,Uint8Array>(),files=new Map<string,any>();
 const env:ShareEnvironment={SHARES_DB:adapter,SHARES_ENABLED:'true',SHARES_ENVIRONMENT:'box-test',SHARES_CREATE_KEY:admin,SHARES_ENCRYPTION_KEY:'a'.repeat(64),BOX_ENABLED:'false',DROPBOX_ENABLED:'true',DROPBOX_ORIGIN:origin,DROPBOX_FOLDER_PATH:'',DROPBOX_APP_KEY:'synthetic-app',DROPBOX_APP_SECRET:'synthetic-app-secret',DROPBOX_CREDENTIALS_KEY:'b'.repeat(64)};
 const upstream=(async(input:any,init:RequestInit)=>{
  calls++;assert.equal(init.redirect,'manual');const url=String(input),headers=new Headers(init.headers),arg=JSON.parse(headers.get('Dropbox-API-Arg')||'{}');
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:'synthetic-token',refresh_token:'synthetic-refresh',expires_in:3600});
  assert.equal(headers.get('Authorization'),'Bearer synthetic-token');
  if(url.endsWith('/users/get_current_account'))return Response.json({account_id:'dbid:synthetic',name:{display_name:'Synthetic'}});
  if(url.endsWith('/files/list_folder'))return Response.json({entries:[],cursor:'cursor'});
  if(redirect)return new Response(null,{status:302,headers:{Location:'https://attacker.invalid/secret'}});
  if(url.endsWith('/upload_session/start')){const id='session-'+sessions.size;sessions.set(id,new Uint8Array());return Response.json({session_id:id});}
  if(url.endsWith('/upload_session/append_v2')){const old=sessions.get(arg.cursor.session_id)!;assert.equal(arg.cursor.offset,old.length);const chunk=new Uint8Array(init.body as ArrayBuffer),next=new Uint8Array(old.length+chunk.length);next.set(old);next.set(chunk,old.length);sessions.set(arg.cursor.session_id,next);return Response.json(null);}
  if(url.endsWith('/upload_session/finish')){const bytes=sessions.get(arg.cursor.session_id)!;assert.equal(arg.cursor.offset,bytes.length);const meta={id:'id:'+String(files.size),rev:'abc'+String(files.size),path_lower:arg.commit.path,size:bytes.length,content_hash:await modelIdentity(bytes.buffer as ArrayBuffer,'dropbox-block-sha256')};files.set(arg.commit.path,{meta,bytes});if(failFinish)throw new Error('lost finish response');return Response.json(meta);}
  if(url.endsWith('/files/get_metadata')){const file=files.get(JSON.parse(String(init.body)).path);return file?Response.json(file.meta):Response.json({}, {status:409});}
  if(url.endsWith('/files/download')){const file=[...files.values()].find(item=>item.meta.id===arg.path);assert.equal(arg.rev,file.meta.rev);return new Response(file.bytes,{headers:{'Dropbox-API-Result':JSON.stringify(file.meta)}});}
  throw new Error('Unexpected provider route');
 })as typeof fetch;
 const worker=createShareWorker({now:()=>clock,fetch:upstream});
 const req=(path:string,method='GET',body?:unknown,cookie='',extra:Record<string,string>={})=>new Request(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 async function reconnect(){
 const start=await worker.fetch(req('/api/shares/admin/dropbox/connect','POST',undefined,'',{Authorization:`Bearer ${admin}`}),env);const auth=new URL((await start.json()as any).authorizationUrl);const connected=await worker.fetch(req('/api/shares/dropbox/callback?'+new URLSearchParams({state:auth.searchParams.get('state')!,code:'synthetic-code'}),'GET',undefined,start.headers.get('Set-Cookie')!.split(';')[0]),env);assert.equal(connected.headers.get('Location'),'/admin/shares?dropbox=connected');
 }
 await reconnect();
 const user='d'.repeat(64);db.prepare('INSERT INTO share_users(id,username,password_salt,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user,'uploader','salt','c'.repeat(64),clock,clock);
 const session=await createUserSession({id:user,username:'uploader',version:clock},req('/api/shares/login'),env,clock),cookie=session.cookie.split(';')[0];
 async function init(bytes=stl(),workspaceToken?:string,filename='model.stl'){const response=await worker.fetch(req('/api/shares/uploads','POST',{filename,size:bytes.length,requestKey:crypto.randomUUID().replace(/-/g,'').repeat(2),...(workspaceToken?{workspaceToken}:{})},cookie),env);assert.equal(response.status,201,await response.clone().text());return(await response.json()as any).id as string;}
 async function chunk(id:string,bytes=stl(),offset=0){return worker.fetch(new Request(origin+`/api/shares/uploads/${id}`,{method:'PUT',headers:{Cookie:cookie,Origin:origin,'Upload-Offset':String(offset)},body:bytes}),env);}
 async function finish(id:string){return worker.fetch(req(`/api/shares/uploads/${id}/complete`,'POST',undefined,cookie),env);}
 async function upload(workspaceToken?:string,bytes=stl(),filename='model.stl'){const id=await init(bytes,workspaceToken,filename);for(let offset=0;offset<bytes.length;offset+=MODEL_BLOCK_BYTES){const result=await chunk(id,bytes.slice(offset,offset+MODEL_BLOCK_BYTES),offset);assert.equal(result.status,200,await result.clone().text());}const response=await finish(id);assert.equal(response.status,200,await response.clone().text());return response.json()as Promise<any>;}
 async function share(asset:any){const response=await worker.fetch(req('/api/shares','POST',{sourceAssetId:asset.id,modelIdentity:asset.modelIdentity,workspace:ws,includeWorkspace:true,label:'Upload workspace'},cookie),env);assert.equal(response.status,201,await response.clone().text());return response.json()as Promise<any>;}
 return{db,env,worker,req,cookie,user,reconnect,init,chunk,finish,upload,share,files,setRedirect(){redirect=true;},loseFinish(){failFinish=true;},advance(ms:number){clock+=ms;},get calls(){return calls;}};
}
test('Dropbox block identity follows the published reference vector and differs from whole-file SHA',async()=>{
 assert.equal(await combineModelBlocks(['2a846fa617c3361fc117e1c5c1e1838c336b6a5cef982c1a2d9bdf68f2f1992a','c68469027410ea393eba6551b9fa1e26db775f00eae70a0c3c129a0011a39cf9','7376192de020925ce6c5ef5a8a0405e931b0a9a8c75517aacd9ca24a8a56818b']),'485291fa0ee50c016982abbfa943957bcd231aae0492ccbaa22c58e3997b35e0');
 assert.notEqual(await modelIdentity(stl().buffer),await modelIdentity(stl().buffer,'dropbox-block-sha256'));
});
test('login-only chunk uploads verify immutable Dropbox version and expose no storage credentials',async()=>{const f=await fixture();try{
 const before=f.calls;assert.equal((await f.worker.fetch(f.req('/api/shares/uploads','POST',{}),f.env)).status,401);assert.equal(f.calls,before);
 const asset=await f.upload(),text=JSON.stringify(asset);assert(!/file_id|file_rev|session|dbid:|id:|synthetic-token/.test(text));
 const privateRow=f.db.prepare('SELECT * FROM model_assets').get()as any;assert.equal(privateRow.content_hash,asset.modelIdentity);assert.notEqual((f.db.prepare('SELECT session_ciphertext FROM model_uploads').get()as any).session_ciphertext,'session-0');
 assert.equal((await f.worker.fetch(f.req(`/api/shares/models/${asset.id}/model.stl`),f.env)).status,401);
 const download=await f.worker.fetch(f.req(`/api/shares/models/${asset.id}/model.stl`,'GET',undefined,f.cookie),f.env);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),stl());
 await f.reconnect();const again=await f.worker.fetch(f.req(`/api/shares/models/${asset.id}/model.stl`,'GET',undefined,f.cookie),f.env);assert.equal(again.status,200,'same-account reconnect keeps committed files accessible');await again.body?.cancel();
}finally{f.db.close();}});
test('workspace recipients select only attached models and concurrent saves bind JSON and geometry per version',async()=>{const f=await fixture();try{
 const first=await f.upload(),share=await f.share(first),second=await f.upload(share.token,new Uint8Array([80,75,3,4,0,1]),'second.3mf'),foreign=await f.upload();
 const save=(asset:any,author:string)=>f.worker.fetch(f.req(`/api/shares/${share.token}`,'PUT',{workspace:ws,modelIdentity:asset.modelIdentity,modelAssetId:asset.id,revision:1,author}),f.env);
 assert.equal((await save(foreign,'Forbidden')).status,403);
 const catalog=await(await f.worker.fetch(f.req(`/api/shares/${share.token}/models`),f.env)).json()as any;assert.equal(catalog.items.length,2);
 const publicModel=await f.worker.fetch(f.req('/api/shares','POST',{sourceShareToken:share.token,selectedAssetId:second.id,modelIdentity:second.modelIdentity,workspace:ws,includeWorkspace:false}),f.env);assert.equal(publicModel.status,201,await publicModel.clone().text());const concealed=await publicModel.json()as any;assert(!concealed.url.includes('dropbox'));
 const results=await Promise.all([save(second,'Second geometry'),save(first,'Original geometry')]);for(const r of results)assert.equal(r.status,200,await r.clone().text());const versions=await Promise.all(results.map(r=>r.json()as Promise<any>));assert.deepEqual(versions.map(v=>v.workspaceVersion).sort(),[2,3]);
 for(const [i,asset]of [second,first].entries()){const v=versions[i].workspaceVersion,meta=await(await f.worker.fetch(f.req(`/api/shares/${share.token}/revisions/${v}`),f.env)).json()as any;assert.equal(meta.modelAssetId,asset.id);assert.equal(meta.modelIdentity,asset.modelIdentity);const response=await f.worker.fetch(f.req(meta.modelUrl),f.env);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.arrayBuffer()).byteLength,asset.size);}
 const times=f.db.prepare('SELECT saved_at FROM share_revisions ORDER BY version').all()as any[];assert(times[2].saved_at>times[1].saved_at);
 const baseline=await(await f.worker.fetch(f.req(`/api/shares/${share.token}/revisions/1`),f.env)).json()as any;assert.equal(baseline.modelAssetId,first.id);
 f.db.exec('UPDATE shares SET revoked_at=1');assert.equal((await f.worker.fetch(f.req(`/api/shares/${share.token}/models`),f.env)).status,404);
}finally{f.db.close();}});
test('uploads reject invalid signatures, offsets, foreign origins, cancellation and changed permissions',async()=>{const f=await fixture();try{
 const id=await f.init();assert.equal((await f.chunk(id,stl(),1)).status,409);assert.equal((await f.chunk(id,new Uint8Array(134))).status,400);
 const cross=f.req(`/api/shares/uploads/${id}`,'DELETE',undefined,f.cookie,{Origin:'https://attacker.invalid'});assert.equal((await f.worker.fetch(cross,f.env)).status,403);
 assert.equal((await f.worker.fetch(f.req(`/api/shares/uploads/${id}`,'DELETE',undefined,f.cookie),f.env)).status,200);assert.equal((await f.chunk(id)).status,409);
 const next=await f.init();f.db.exec('UPDATE dropbox_connection SET epoch=epoch+1');assert.equal((await f.chunk(next)).status,409);
 f.db.exec('UPDATE share_users SET active=0');assert.equal((await f.worker.fetch(f.req('/api/shares/uploads','GET',undefined,f.cookie),f.env)).status,401);
}finally{f.db.close();}});
test('ambiguous Dropbox finish reconciles by private generated path, and provider redirects never publish',async()=>{const f=await fixture();try{f.loseFinish();const asset=await f.upload();assert(asset.id);f.setRedirect();const before=f.calls;const response=await f.worker.fetch(f.req('/api/shares/uploads','POST',{filename:'new.stl',size:134,requestKey:'9'.repeat(64)},f.cookie),f.env);assert.equal(response.status,503);assert.equal(f.calls,before+1);assert.equal((f.db.prepare('SELECT count(*) n FROM model_assets').get()as any).n,1);}finally{f.db.close();}});
test('bounded storage reservations, disabled workspace editing and expired upload cleanup fail closed',async()=>{const f=await fixture();try{
 const asset=await f.upload(),share=await f.share(asset);f.db.exec('UPDATE shares SET editing_enabled=0,auth_epoch=auth_epoch+1');const r=await f.worker.fetch(f.req('/api/shares/uploads','POST',{filename:'new.stl',size:134,requestKey:'8'.repeat(64),workspaceToken:share.token},f.cookie),f.env);assert.equal(r.status,403);
 f.db.exec('UPDATE model_assets SET size=536870912');assert.equal((await f.worker.fetch(f.req('/api/shares/uploads','POST',{filename:'new.stl',size:134,requestKey:'7'.repeat(64)},f.cookie),f.env)).status,429);
 f.advance(3600001);await cleanupExpiredShares(f.env,Date.now()+3600001);assert.equal((f.db.prepare('SELECT count(*) n FROM model_uploads').get()as any).n,0);assert.equal((f.db.prepare('SELECT count(*) n FROM model_assets').get()as any).n,1,'cleanup does not remove model files/catalog');
}finally{f.db.close();}});

test('uploads cross the 4 MiB boundary without changing the Dropbox content identity',async()=>{const f=await fixture();try{
 const count=Math.ceil((MODEL_BLOCK_BYTES-84)/50)+1,bytes=new Uint8Array(84+50*count);new DataView(bytes.buffer).setUint32(80,count,true);
 const asset=await f.upload(undefined,bytes);assert.equal(asset.modelIdentity,await modelIdentity(bytes.buffer,'dropbox-block-sha256'));assert.equal(asset.size,bytes.length);
 const upload=f.db.prepare('SELECT offset,block_hashes,status FROM model_uploads').get()as any;assert.equal(upload.offset,bytes.length);assert.equal(JSON.parse(upload.block_hashes).length,2);assert.equal(upload.status,'ready');
}finally{f.db.close();}});
