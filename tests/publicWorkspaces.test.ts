import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createShareWorker,hashToken,SHARE_LIFETIME_MS,type D1Statement,type ShareEnvironment } from '../worker/index';
import { cleanupExpiredShares } from '../worker/cleanup';
import { HISTORY_BYTE_LIMIT } from '../worker/workspaceAccess';

class Database {
  db=new DatabaseSync(':memory:');
  constructor(history=true){
    this.db.exec('PRAGMA foreign_keys=ON');
    for(const name of ['0001_shares','0002_editable_workspaces',...(history?['0003_public_workspace_history']:[])])this.db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
    this.db.exec("INSERT INTO share_environment(scope) VALUES('test')");
  }
  prepare(sql:string):D1Statement {const db=this.db;let args:any[]=[];return {bind(...values:any[]){args=values;return this;},async first<T>(){return (db.prepare(sql).get(...args)||null) as T|null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
  // D1 serializes transactions. Execute our synchronous SQLite statements before yielding.
  pending:Promise<unknown>=Promise.resolve();
  async batch(statements:D1Statement[]){const next=this.pending.then(async()=>{this.db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());this.db.exec('COMMIT');return result;}catch(reason){this.db.exec('ROLLBACK');throw reason;}});this.pending=next.catch(()=>{});return next;}
}
const admin='synthetic-admin-password-'.repeat(3),password='synthetic-workspace-password',origin='https://viewer.example.com';
const identity='ca'.repeat(32),matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const workspace=(hidden=false)=>({schemaVersion:2,modelMatrix:matrix,coordinateSystem:{systemType:'Viewer world with recorded model root',units:'millimeters (mm)'},objects:[],groups:[],meshes:[{key:'0',vertices:3,indices:3,visible:!hidden,opacity:hidden?0:1}]});
function setup(){const db=new Database();const env:ShareEnvironment&{SHARES_DB:Database}={SHARES_DB:db,SHARES_ENABLED:'true',SHARES_ENVIRONMENT:'test',SHARES_CREATE_KEY:admin,SHARES_ENCRYPTION_KEY:'ab'.repeat(32)};return {env,worker:createShareWorker()};}
function request(path:string,method='GET',body?:unknown,credential?:string){return new Request(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(credential?{Authorization:`Bearer ${credential}`}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function ensureUser(worker:ReturnType<typeof createShareWorker>,env:ShareEnvironment) {
  const db=(env.SHARES_DB as Database).db;
  if(db.prepare('SELECT id FROM share_users WHERE username=?').get('sharer.one'))return;
  const response=await worker.fetch(request('/api/shares/admin/users','POST',{username:'sharer.one',password},admin),env);
  assert.equal(response.status,201,await response.clone().text());
}
async function create(worker:ReturnType<typeof createShareWorker>,env:ShareEnvironment,includeWorkspace=true){
  if(includeWorkspace)await ensureUser(worker,env);
  const response=await worker.fetch(request('/api/shares','POST',{sourceUrl:'https://www.dropbox.com/scl/fi/synthetic/model.3mf?rlkey=secret-source',modelIdentity:identity,workspace:workspace(),label:'Test workspace',includeWorkspace,...(includeWorkspace?{sharingUsername:'sharer.one',sharingPassword:password}:{})}),env);
  assert.equal(response.status,201,await response.clone().text());return response.json() as Promise<any>;
}
function save(token:string,revision:number,author='Editor One',hidden=false){return request(`/api/shares/${token}`,'PUT',{workspace:workspace(hidden),modelIdentity:identity,revision,author});}

test('model-only links are public, strip analytic/mesh state and never reveal Dropbox or passwords',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env,false),path=`/api/shares/${share.token}`;
    const metadata=await (await worker.fetch(request(path),env)).json() as any;
    assert.equal(metadata.includeWorkspace,false);assert.equal(metadata.editingEnabled,false);assert.equal(metadata.role,'view');
    assert.deepEqual(metadata.workspace.objects,[]);assert.equal(metadata.workspace.meshes,undefined);
    assert(!JSON.stringify(metadata).includes('dropbox'));assert(!JSON.stringify(metadata).includes('secret-source'));

    assert.equal((await worker.fetch(request(path+'/revisions'),env)).status,404);
    assert.equal((await worker.fetch(save(share.token,1),env)).status,403);
    const record=env.SHARES_DB.db.prepare('SELECT * FROM shares').get() as any;
    assert(!JSON.stringify(record).includes(share.token));
  }finally{env.SHARES_DB.db.close();}
});
test('only assigned sharing users can publish workspaces; admin credentials cannot publish',async()=>{
  const {env,worker}=setup();try{
    assert.equal((await worker.fetch(request('/api/shares/admin/users','POST',{username:'admin-reuse',password:admin},admin),env)).status,400,'sharing passwords must differ from the admin password');
    await ensureUser(worker,env);
    const body={sourceUrl:'https://dl.dropboxusercontent.com/model.3mf',workspace:workspace(),modelIdentity:identity,includeWorkspace:true};
    assert.equal((await worker.fetch(request('/api/shares','POST',body,admin),env)).status,401);
    assert.equal((await worker.fetch(request('/api/shares','POST',{...body,sharingUsername:'sharer.one',sharingPassword:admin},admin),env)).status,401);
    const share=await create(worker,env),path=`/api/shares/${share.token}`;
    const record=env.SHARES_DB.db.prepare('SELECT * FROM shares').get() as any;
    const user=env.SHARES_DB.db.prepare('SELECT * FROM share_users').get() as any;
    assert(!JSON.stringify(user).includes(password));assert.match(user.password_hash,/^[a-f0-9]{64}$/);assert.match(record.owner_ref,/^sharer:/);
    assert.equal((await worker.fetch(request(path+'/share-link','POST',{username:'sharer.one',password:'wrong-but-long-password'}),env)).status,401);
    const authorized=await worker.fetch(request(path+'/share-link','POST',{username:'sharer.one',password}),env);assert.equal(authorized.status,200);assert.equal((await authorized.json() as any).url,share.url);
    assert.equal((await worker.fetch(save(share.token,1),env)).status,200,'recipients save without a password');
    assert.equal((await worker.fetch(request('/api/shares/admin','GET',undefined,password),env)).status,401,'sharing passwords have no admin rights');
  }finally{env.SHARES_DB.db.close();}
});
test('schema 3 preserves existing sources and public links while requiring explicit public-edit opt-in',async()=>{
  const {env,worker}=setup();env.SHARES_DB.db.close();env.SHARES_DB=new Database(false);
  try{
    const response=await worker.fetch(request('/api/shares','POST',{sourceUrl:'https://dl.dropboxusercontent.com/model.3mf',workspace:workspace(),modelIdentity:identity},admin),env);
    assert.equal(response.status,201);const share=await response.json() as any;
    const editResponse=await worker.fetch(request(`/api/shares/${share.token}/edit-link`,'POST',undefined,admin),env);assert.equal(editResponse.status,200);
    const editToken=new URL((await editResponse.json() as any).url).pathname.split('/').at(-1)!;
    const cipher=(env.SHARES_DB.db.prepare('SELECT source_ciphertext FROM shares').get() as any).source_ciphertext;
    env.SHARES_DB.db.exec(readFileSync(new URL('../migrations/0003_public_workspace_history.sql',import.meta.url),'utf8'));
    for(const token of [share.token,editToken]){
      const metadata=await (await worker.fetch(request(`/api/shares/${token}`),env)).json() as any;
      assert.equal(metadata.role,'view');assert.equal(metadata.editingEnabled,false);assert.deepEqual(metadata.workspace,workspace());
      assert.equal((await worker.fetch(save(token,1),env)).status,403);
    }
    assert.equal((env.SHARES_DB.db.prepare('SELECT source_ciphertext FROM shares').get() as any).source_ciphertext,cipher);
    const enabled=await worker.fetch(request(`/api/shares/admin/${await hashToken(share.token)}`,'PATCH',{revision:1,editingEnabled:true},admin),env);assert.equal(enabled.status,200);
    assert.equal((await worker.fetch(save(share.token,2),env)).status,200);
    assert.equal((await (await worker.fetch(request(`/api/shares/${share.token}/revisions`),env)).json() as any).items.length,2);
  }finally{env.SHARES_DB.db.close();}
});
test('explicit saves preserve author, analytic/mesh snapshots and conflict-safe versions under one URL',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env),path=`/api/shares/${share.token}`;
    assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM share_revisions').get() as any).n,0,'opening must not save');
    const result=await worker.fetch(save(share.token,1,'Editor One',true),env);assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json() as any).workspaceVersion,2);
    assert.equal((await worker.fetch(save(share.token,1,'Stale Editor'),env)).status,409);
    const second=await worker.fetch(save(share.token,2,'Editor Two'),env);assert.equal(second.status,200);
    const history=await (await worker.fetch(request(path+'/revisions'),env)).json() as any;
    assert.deepEqual(history.items.map((row:any)=>[row.version,row.author]),[[3,'Editor Two'],[2,'Editor One'],[1,'Previous saved state']]);
    const old=await (await worker.fetch(request(path+'/revisions/2'),env)).json() as any;assert.deepEqual(old.workspace,workspace(true));assert.equal(old.revision,3);
    const latest=await (await worker.fetch(request(path),env)).json() as any;assert.equal(latest.workspaceVersion,3);assert.deepEqual(latest.workspace,workspace());
    assert(!JSON.stringify(history).includes(password));assert(!JSON.stringify(history).includes('dropbox'));
    assert.equal((await worker.fetch(save(share.token,3,''),env)).status,400);
  }finally{env.SHARES_DB.db.close();}
});
test('admins assign and rotate individual user passwords independently from public editing permission',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env),id=await hashToken(share.token),path=`/api/shares/${share.token}`;
    const user=env.SHARES_DB.db.prepare('SELECT * FROM share_users').get() as any;
    const patchUser=(data:any)=>worker.fetch(request(`/api/shares/admin/users/${user.id}`,'PATCH',{updatedAt:user.updated_at,...data},admin),env);
    assert.equal((await patchUser({password:'new-assigned-sharing-password'})).status,200);
    assert.equal((await patchUser({active:false})).status,409,'stale admin user edits cannot overwrite changes');
    assert.equal((await worker.fetch(request(path+'/share-link','POST',{username:'sharer.one',password}),env)).status,401);
    assert.equal((await worker.fetch(request(path+'/share-link','POST',{username:'sharer.one',password:'new-assigned-sharing-password'}),env)).status,200);
    user.updated_at=(env.SHARES_DB.db.prepare('SELECT updated_at FROM share_users').get() as any).updated_at;
    assert.equal((await patchUser({active:false})).status,200);
    assert.equal((await worker.fetch(request(path+'/share-link','POST',{username:'sharer.one',password:'new-assigned-sharing-password'}),env)).status,401);
    assert.equal((await worker.fetch(save(share.token,1),env)).status,200,'recipients remain password-free');
    const patch=(data:any)=>worker.fetch(request(`/api/shares/admin/${id}`,'PATCH',data,admin),env);
    assert.equal((await patch({revision:2,editingEnabled:false})).status,200);
    assert.equal((await worker.fetch(save(share.token,3),env)).status,403);
    assert.equal((await worker.fetch(request(path),env)).status,200);
    assert.equal((await patch({revision:3,editingEnabled:true})).status,200);
    assert.equal((await worker.fetch(save(share.token,4),env)).status,200);
    assert.equal((await patch({revision:5,expiresAt:new Date(Date.now()+SHARE_LIFETIME_MS+10000).toISOString()})).status,400);
    const list=await (await worker.fetch(request('/api/shares/admin/users','GET',undefined,admin),env)).json() as any;
    assert.equal(list.items[0].active,0);assert(!JSON.stringify(list).includes('password_hash'));assert(!JSON.stringify(list).includes(password));
  }finally{env.SHARES_DB.db.close();}
});
test('batch revocation disables selected links, streams, histories and cleanup cascades',async()=>{
  const {env,worker}=setup();try{
    const shares=[await create(worker,env),await create(worker,env),await create(worker,env)];
    assert.equal((await worker.fetch(save(shares[0].token,1),env)).status,200);
    const ids=await Promise.all(shares.slice(0,2).map(share=>hashToken(share.token)));
    assert.equal((await worker.fetch(request('/api/shares/admin/revoke-batch','POST',{ids}),env)).status,401);
    assert.equal((await worker.fetch(request('/api/shares/admin/revoke-batch','POST',{ids:[...ids,ids[0]]},admin),env)).status,400);
    assert.equal((await worker.fetch(request('/api/shares/admin/revoke-batch','POST',{ids},admin),env)).status,200);
    for(const share of shares.slice(0,2))for(const suffix of ['','/model.3mf','/revisions','/revisions/1'])assert.equal((await worker.fetch(request(`/api/shares/${share.token}${suffix}`),env)).status,404);
    assert.equal((await worker.fetch(save(shares[0].token,2),env)).status,404);
    assert.equal((await worker.fetch(request(`/api/shares/${shares[2].token}`),env)).status,200);
    await cleanupExpiredShares(env);assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM share_revisions').get() as any).n,0);
  }finally{env.SHARES_DB.db.close();}
});
test('history retains only twenty saved versions and enforces its global byte budget without overwriting',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env);
    for(let revision=1;revision<=22;revision++)assert.equal((await worker.fetch(save(share.token,revision,`Editor ${revision}`),env)).status,200);
    const rows=env.SHARES_DB.db.prepare('SELECT version FROM share_revisions ORDER BY version').all() as any[];assert.equal(rows.length,20);assert.equal(rows[0].version,4);assert.equal(rows.at(-1).version,23);
    assert.equal((await worker.fetch(request(`/api/shares/${share.token}/revisions/1`),env)).status,404);
    // Populate the bounded metadata ledger to the exact production budget.
    const insert=env.SHARES_DB.db.prepare('INSERT INTO share_revisions VALUES(?,?,?,?,?,?,?)');
    const bytes=(env.SHARES_DB.db.prepare('SELECT SUM(byte_count) AS n FROM share_revisions').get() as any).n;
    let remaining=HISTORY_BYTE_LIMIT-bytes;
    for(let i=1000;remaining>0;i++){const count=Math.min(262144,remaining);insert.run(await hashToken(share.token),i,'{}',count,'Budget fixture',0,`fixture-${i}`);remaining-=count;}
    assert.equal((await worker.fetch(save(share.token,23),env)).status,507);
    assert.equal((env.SHARES_DB.db.prepare('SELECT revision FROM shares').get() as any).revision,23);
  }finally{env.SHARES_DB.db.close();}
});
test('public creation and sharing-password guessing are rate limited before expensive work',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env);
    for(let i=0;i<4;i++)assert.equal((await worker.fetch(request(`/api/shares/${share.token}/share-link`,'POST',{username:'sharer.one',password:'incorrect-password'}),env)).status,401);
    assert.equal((await worker.fetch(request(`/api/shares/${share.token}/share-link`,'POST',{username:'sharer.one',password}),env)).status,429);
    for(let i=0;i<5;i++)await create(worker,env,false);
    const denied=await worker.fetch(request('/api/shares','POST',{includeWorkspace:false}),env);assert.equal(denied.status,429);
  }finally{env.SHARES_DB.db.close();}
});

test('concurrent public saves produce one saved version and one conflict',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env);
    const responses=await Promise.all([worker.fetch(save(share.token,1,'First editor',true),env),worker.fetch(save(share.token,1,'Second editor'),env)]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
    assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM share_revisions').get() as any).n,2);
  }finally{env.SHARES_DB.db.close();}
});
test('batch disabling sharing users leaves their public recipient access separate',async()=>{
  const {env,worker}=setup();try{
    const share=await create(worker,env);
    const second=await worker.fetch(request('/api/shares/admin/users','POST',{username:'sharer.two',password:'second-assigned-sharing-password'},admin),env);assert.equal(second.status,201);
    const users=env.SHARES_DB.db.prepare('SELECT id FROM share_users').all() as any[];
    const response=await worker.fetch(request('/api/shares/admin/users/disable-batch','POST',{ids:users.map(user=>user.id)},admin),env);assert.equal(response.status,200);
    assert.equal((env.SHARES_DB.db.prepare('SELECT count(*) AS n FROM share_users WHERE active=1').get() as any).n,0);
    assert.equal((await worker.fetch(request(`/api/shares/${share.token}/share-link`,'POST',{username:'sharer.one',password}),env)).status,401);
    assert.equal((await worker.fetch(save(share.token,1),env)).status,200);
  }finally{env.SHARES_DB.db.close();}
});

async function signIn(worker:ReturnType<typeof createShareWorker>,env:ShareEnvironment){
  await ensureUser(worker,env);
  const response=await worker.fetch(request('/api/shares/login','POST',{username:'sharer.one',password}),env);
  assert.equal(response.status,200,await response.clone().text());
  return {cookie:response.headers.get('Set-Cookie')!.split(';')[0],headers:response.headers,body:await response.json() as any};
}
function withCookie(input:Request,cookie:string){const headers=new Headers(input.headers);headers.set('Cookie',cookie);return new Request(input,{headers});}
function namedWorkspace(expiresAt?:string){return {sourceUrl:'https://dl.dropboxusercontent.com/model.3mf',workspace:workspace(),modelIdentity:identity,includeWorkspace:true,label:'Named clinical workspace',...(expiresAt?{expiresAt}:{})};}
test('a signed-in user can create a named workspace from a concealed model-only link without learning its source',async()=>{
  const {env,worker}=setup();try{
    const model=await create(worker,env,false),session=await signIn(worker,env);
    const body={sourceShareToken:model.token,workspace:workspace(true),modelIdentity:identity,includeWorkspace:true,label:'Workspace from model link',expiresAt:new Date(Date.now()+86_400_000).toISOString()};
    const publish=(data:any)=>worker.fetch(withCookie(request('/api/shares','POST',data),session.cookie),env);
    assert.equal((await worker.fetch(request('/api/shares','POST',body),env)).status,401);
    assert.equal((await publish({...body,modelIdentity:'ab'.repeat(32)})).status,409);
    assert.equal((await publish({...body,sourceUrl:'https://dl.dropboxusercontent.com/other.3mf'})).status,400);
    const response=await publish(body);assert.equal(response.status,201,await response.clone().text());const share=await response.json() as any;
    assert.notEqual(share.token,model.token);assert(!JSON.stringify(share).includes('dropbox'));
    const metadata=await (await worker.fetch(request(`/api/shares/${share.token}`),env)).json() as any;
    assert.equal(metadata.includeWorkspace,true);assert.equal(metadata.workspaceName,body.label);assert.equal(metadata.workspace.meshes[0].visible,false);
    const sources=env.SHARES_DB.db.prepare('SELECT source_ciphertext FROM shares').all() as any[];assert.notEqual(sources[0].source_ciphertext,sources[1].source_ciphertext);
    assert.equal((await (await worker.fetch(request(`/api/shares/${model.token}`),env)).json() as any).includeWorkspace,false);
  }finally{env.SHARES_DB.db.close();}
});
test('front-page login uses secure revocable cookies and returns a bounded permission profile',async()=>{
  const {env,worker}=setup();try{
    const guest=await worker.fetch(request('/api/shares/session'),env);assert.deepEqual(await guest.json(),{authenticated:false,enabled:true});
    const session=await signIn(worker,env);
    for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert(session.headers.get('Set-Cookie')!.includes(flag));
    assert.equal(session.headers.get('Cache-Control'),'no-store, max-age=0');
    assert.equal(session.body.user.username,'sharer.one');assert.deepEqual(session.body.user.permissions,['workspace:share']);
    assert(!JSON.stringify(session.body).includes(password));assert(!JSON.stringify(session.body).includes('nonce'));
    const stored=env.SHARES_DB.db.prepare("SELECT bucket FROM share_rate_limits WHERE bucket LIKE 'session:%'").get() as any;
    assert(stored);assert(!stored.bucket.includes(session.cookie));
    const current=await worker.fetch(withCookie(request('/api/shares/session'),session.cookie),env);
    assert.equal((await current.json() as any).authenticated,true);
    const adminAttempt=await worker.fetch(withCookie(request('/api/shares/admin'),session.cookie),env);assert.equal(adminAttempt.status,401);
  }finally{env.SHARES_DB.db.close();}
});
test('signed-in workspace publishing validates its name and custom expiry, while guest model sharing stays public',async()=>{
  const {env,worker}=setup();try{
    const session=await signIn(worker,env),expiry=new Date(Date.now()+7*86_400_000).toISOString();
    assert.equal((await worker.fetch(request('/api/shares','POST',namedWorkspace(expiry)),env)).status,401);
    const publish=(body:any)=>worker.fetch(withCookie(request('/api/shares','POST',body),session.cookie),env);
    assert.equal((await publish({...namedWorkspace(expiry),label:' '})).status,400);
    assert.equal((await publish(namedWorkspace(new Date(Date.now()-1).toISOString()))).status,400);
    assert.equal((await publish(namedWorkspace(new Date(Date.now()+181*86_400_000).toISOString()))).status,400);
    const response=await publish(namedWorkspace(expiry));assert.equal(response.status,201,await response.clone().text());
    const share=await response.json() as any;assert.equal(share.expiresAt,expiry);
    const metadata=await (await worker.fetch(request(`/api/shares/${share.token}`),env)).json() as any;
    assert.equal(metadata.workspaceName,'Named clinical workspace');assert.equal(metadata.editingEnabled,true);assert.equal(metadata.expiresAt,expiry);
    assert.equal((await worker.fetch(save(share.token,1,'Guest recipient',true),env)).status,200);
    const reshared=await worker.fetch(withCookie(request(`/api/shares/${share.token}/share-link`,'POST',{}),session.cookie),env);assert.equal(reshared.status,200);assert.equal((await reshared.json() as any).url,share.url);
    await create(worker,env,false);
  }finally{env.SHARES_DB.db.close();}
});
test('logout revokes copied sessions on the server without disabling password-free workspace recipients',async()=>{
  const {env,worker}=setup();try{
    const session=await signIn(worker,env);
    const created=await worker.fetch(withCookie(request('/api/shares','POST',namedWorkspace()),session.cookie),env);assert.equal(created.status,201);const share=await created.json() as any;
    const logout=await worker.fetch(withCookie(request('/api/shares/logout','POST'),session.cookie),env);assert.equal(logout.status,200);assert(logout.headers.get('Set-Cookie')!.includes('Max-Age=0'));
    const replay=await worker.fetch(withCookie(request('/api/shares/session'),session.cookie),env);assert.equal((await replay.json() as any).authenticated,false);
    assert.equal((await worker.fetch(withCookie(request('/api/shares','POST',namedWorkspace()),session.cookie),env)).status,401);
    assert.equal((await worker.fetch(save(share.token,1,'Guest after publisher logout',true),env)).status,200);
  }finally{env.SHARES_DB.db.close();}
});
test('tampered, cross-origin and cross-environment session cookies cannot grant permissions',async()=>{
  const {env,worker}=setup();try{
    const session=await signIn(worker,env),dot=session.cookie.lastIndexOf('.');
    const changed=session.cookie.slice(0,dot+1)+(session.cookie[dot+1]==='a'?'b':'a')+session.cookie.slice(dot+2);
    const duplicate=session.cookie+'; '+session.cookie;
    for(const cookie of [changed,duplicate]){
      const current=await worker.fetch(withCookie(request('/api/shares/session'),cookie),env);assert.equal((await current.json() as any).authenticated,false);
    }
    const anotherHost=await worker.fetch(new Request('https://other.example.com/api/shares/session',{headers:{Cookie:session.cookie}}),env);assert.equal((await anotherHost.json() as any).authenticated,false);
    env.SHARES_ENVIRONMENT='beta';env.SHARES_DB.db.prepare("UPDATE share_environment SET scope='beta'").run();
    const anotherTier=await worker.fetch(withCookie(request('/api/shares/session'),session.cookie),env);assert.equal((await anotherTier.json() as any).authenticated,false);
    const hostile=request('/api/shares/logout','POST');hostile.headers.set('Origin','https://attacker.example');assert.equal((await worker.fetch(withCookie(hostile,session.cookie),env)).status,403);
  }finally{env.SHARES_DB.db.close();}
});
test('sharing-user password changes and user disable immediately invalidate existing login sessions',async()=>{
  const {env,worker}=setup();try{
    const first=await signIn(worker,env),second=await signIn(worker,env);
    const user=env.SHARES_DB.db.prepare('SELECT * FROM share_users').get() as any;
    const changed=await worker.fetch(request(`/api/shares/admin/users/${user.id}`,'PATCH',{updatedAt:user.updated_at,password:'rotated-sharing-login-password'},admin),env);assert.equal(changed.status,200);
    for(const session of [first,second])assert.equal((await(await worker.fetch(withCookie(request('/api/shares/session'),session.cookie),env)).json() as any).authenticated,false);
    const login=await worker.fetch(request('/api/shares/login','POST',{username:'sharer.one',password:'rotated-sharing-login-password'}),env);assert.equal(login.status,200);
    const cookie=login.headers.get('Set-Cookie')!.split(';')[0];
    const current=env.SHARES_DB.db.prepare('SELECT updated_at FROM share_users').get() as any;
    assert.equal((await worker.fetch(request(`/api/shares/admin/users/${user.id}`,'PATCH',{updatedAt:current.updated_at,active:false},admin),env)).status,200);
    assert.equal((await(await worker.fetch(withCookie(request('/api/shares/session'),cookie),env)).json() as any).authenticated,false);
  }finally{env.SHARES_DB.db.close();}
});
test('sessions expire in eight hours and their cleanup leaves permanent workspace revisions intact',async()=>{
  const {env}=setup();let now=1_800_000_000_000;const worker=createShareWorker({now:()=>now});
  try{
    const session=await signIn(worker,env);
    assert.equal(Date.parse(session.body.user.expiresAt),now+8*60*60*1000);
    const response=await worker.fetch(withCookie(request('/api/shares','POST',namedWorkspace()),session.cookie),env);assert.equal(response.status,201);const share=await response.json() as any;
    assert.equal((await worker.fetch(save(share.token,1),env)).status,200);
    now+=8*60*60*1000+1;
    assert.equal((await(await worker.fetch(withCookie(request('/api/shares/session'),session.cookie),env)).json() as any).authenticated,false);
    await cleanupExpiredShares(env,now);
    assert.equal((env.SHARES_DB.db.prepare("SELECT count(*) AS n FROM share_rate_limits WHERE bucket LIKE 'session:%'").get() as any).n,0);
    assert.equal((await worker.fetch(request(`/api/shares/${share.token}/revisions`),env)).status,200);
  }finally{env.SHARES_DB.db.close();}
});
