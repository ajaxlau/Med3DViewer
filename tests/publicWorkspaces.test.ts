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
  const response=await worker.fetch(request('/api/shares','POST',{sourceUrl:'https://www.dropbox.com/scl/fi/synthetic/model.3mf?rlkey=secret-source',modelIdentity:identity,workspace:workspace(),includeWorkspace,...(includeWorkspace?{sharingUsername:'sharer.one',sharingPassword:password}:{})}),env);
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
