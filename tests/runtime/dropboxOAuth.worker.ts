import { createShareWorker, type ShareDatabase, type ShareEnvironment } from '../../worker/index';
const origin='https://ntec3dpo-m3dv-box-test.x-panda.workers.dev';
function check(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
async function exercise(redirect=false){
 let row:any={epoch:0,status:'disconnected',account_id:null,credentials:null};
 let state:any=null;
 const database:ShareDatabase={prepare(sql){let values:any[]=[];return {
  bind(...args:any[]){values=args;return this;},
  async first<T>(){
   let result:any;
   if(sql==='SELECT scope FROM share_environment WHERE id=1')result={scope:'box-test'};
   else if(sql==='SELECT version FROM share_schema_version WHERE id=1')result={version:6};
   else if(sql==='SELECT * FROM dropbox_connection WHERE id=1')result={...row};
   else if(sql.startsWith('UPDATE dropbox_connection SET epoch=epoch+1')){row={...row,epoch:row.epoch+1,status:'connecting',folder_id:values[0]};result={...row};}
   else if(sql.startsWith('DELETE FROM dropbox_oauth_states WHERE state_hash=')){result=state&&state.state_hash===values[0]&&state.browser_hash===values[1]&&state.expires_at>values[2]&&row.status==='connecting'?{epoch:row.epoch}:null;state=null;}
   else throw new Error('Unexpected runtime fixture read');
   return result as T;
  },
  async run(){
   if(sql.startsWith('DELETE FROM dropbox_oauth_states'))state=null;
   else if(sql.startsWith('INSERT INTO dropbox_oauth_states'))state={state_hash:values[0],browser_hash:values[1],epoch:values[2],expires_at:values[3]};
   else if(sql.startsWith("UPDATE dropbox_connection SET status='connected'"))row={...row,status:'connected',account_id:values[0],account_name:values[1],folder_id:values[2],folder_name:values[3],credentials:values[4]};
   else if(sql.startsWith("UPDATE dropbox_connection SET status='reconnect'"))row={...row,status:'reconnect',credentials:null};
   else throw new Error('Unexpected runtime fixture write');
   return {meta:{changes:1}};
  },
 };},async batch(){throw new Error('Unexpected runtime fixture batch');}};
 const admin='synthetic-runtime-admin-'.repeat(3);
 const env:ShareEnvironment={SHARES_DB:database,SHARES_ENABLED:'true',SHARES_ENVIRONMENT:'box-test',SHARES_CREATE_KEY:admin,SHARES_ENCRYPTION_KEY:'a'.repeat(64),BOX_ENABLED:'false',DROPBOX_ENABLED:'true',DROPBOX_ORIGIN:origin,DROPBOX_FOLDER_PATH:'',DROPBOX_APP_KEY:'synthetic-runtime-app',DROPBOX_APP_SECRET:redirect?'synthetic-secret-redirect':'synthetic-secret-success',DROPBOX_CREDENTIALS_KEY:'b'.repeat(64)};
 const worker=createShareWorker(); // Real Workers fetch validates request options.
 const start=await worker.fetch(new Request(origin+'/api/shares/admin/dropbox/connect',{method:'POST',headers:{Authorization:`Bearer ${admin}`,Origin:origin}}),env);
 check(start.status===200,'Runtime OAuth start failed');
 const target=new URL((await start.json() as any).authorizationUrl),cookie=start.headers.get('Set-Cookie')!.split(';')[0];
 const callback=await worker.fetch(new Request(origin+'/api/shares/dropbox/callback?'+new URLSearchParams({state:target.searchParams.get('state')!,code:'synthetic-code'}),{headers:{Cookie:cookie}}),env);
 const final=new URL(callback.headers.get('Location')!,origin);
 check(callback.status===303,'Runtime OAuth callback did not redirect');
 if(redirect){check(final.searchParams.get('reason')==='DROPBOX_REDIRECT_BLOCKED','Runtime did not block provider redirect');check(row.credentials===null,'Blocked redirect saved credentials');}
 else{check(final.searchParams.get('dropbox')==='connected','Runtime OAuth exchange/account/folder flow failed: '+final.search);check(typeof row.credentials==='string'&&!row.credentials.includes('synthetic-access'),'Runtime credentials were not encrypted');}
}
export const success={async test(){await exercise();}};
export const redirect={async test(){await exercise(true);}};
