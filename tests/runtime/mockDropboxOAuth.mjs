// In-process origin only. No actual accounts, credentials or outbound network.
export default {async fetch(request){
 const url=new URL(request.url);
 if(url.hostname!=='api.dropboxapi.com')throw new Error('OAuth credentials followed an unexpected destination');
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
 if(url.pathname==='/2/users/get_current_account')return Response.json({account_id:'dbid:synthetic',name:{display_name:'Synthetic account'}});
 if(url.pathname==='/2/files/list_folder'){
  const body=await request.json();if(body.path!==''||body.limit!==1)throw new Error('Unexpected directory query');
  return Response.json({entries:[],cursor:'synthetic-private-cursor'});
 }
 throw new Error('Unexpected runtime OAuth path');
}};
