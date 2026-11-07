// In-process origin only. No actual accounts, credentials or outbound network.
export default {async fetch(request){
 const url=new URL(request.url);
 if(!['api.dropboxapi.com','content.dropboxapi.com'].includes(url.hostname))throw new Error('OAuth credentials followed an unexpected destination');
 if(request.method!=='POST')throw new Error('Unexpected OAuth method');
 if(url.pathname==='/oauth2/token'){
  const form=new URLSearchParams(new TextDecoder().decode(await request.arrayBuffer()));
  if(form.get('client_id')!=='synthetic-runtime-app')throw new Error('Wrong app key');
  if(form.get('client_secret')==='synthetic-secret-redirect')return new Response(null,{status:302,headers:{Location:'https://unexpected.example/credentials-must-not-arrive'}});
  if(form.get('client_secret')!=='synthetic-secret-success')throw new Error('Wrong synthetic secret');
  if(form.get('redirect_uri')!=='https://ntec3dpo-m3dv-box-test.x-panda.workers.dev/api/shares/dropbox/callback')throw new Error('Wrong callback');
  return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope:'account_info.read files.metadata.read files.content.read files.content.write'});
 }
 if(request.headers.get('Authorization')!=='Bearer synthetic-access')throw new Error('Wrong synthetic authorization');
 if(url.hostname==='content.dropboxapi.com'){
  const arg=JSON.parse(request.headers.get('Dropbox-API-Arg')||'{}');
  if(url.pathname==='/2/files/upload_session/start'){if((await request.arrayBuffer()).byteLength!==0)throw new Error('Unexpected start bytes');return Response.json({session_id:'native-session'});}
  if(url.pathname==='/2/files/upload_session/append_v2'){if(arg.cursor.session_id!=='native-session'||arg.cursor.offset!==0||new Uint8Array(await request.arrayBuffer()).join(',')!=='1,2,3')throw new Error('Invalid runtime chunk');return Response.json(null);}
  if(url.pathname==='/2/files/download'){if(arg.path!=='id:native-file'||arg.rev!=='abc')throw new Error('Unpinned private download');return new Response(new Uint8Array([1,2,3]),{headers:{'Dropbox-API-Result':JSON.stringify({id:arg.path,rev:arg.rev,size:3,content_hash:'e'.repeat(64)})}});}
  throw new Error('Unsupported content route');
 }
 if(url.pathname==='/2/users/get_current_account')return Response.json({account_id:'dbid:synthetic',name:{display_name:'Synthetic account'}});
 if(url.pathname==='/2/files/list_folder'){
  const body=await request.json();if(body.path!==''||body.limit!==1)throw new Error('Unexpected directory query');
  return Response.json({entries:[],cursor:'synthetic-private-cursor'});
 }
 throw new Error('Unexpected runtime OAuth path');
}};
