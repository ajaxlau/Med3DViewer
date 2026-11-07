import { getDeviceLoadProfile, validateLocalFiles } from './modelLoading';
import type { GpuCapabilities } from './gpuDetection';
import { MODEL_BLOCK_BYTES, modelIdentity } from './modelIdentity';
import { readBoundedBytes } from './sharedWorkspace';
export interface UploadedModel { id:string;name:string;extension:'stl'|'3mf';size:number;modelIdentity:string;identityKind:'dropbox-block-sha256';createdAt:number }
const HEX=/^[a-f0-9]{64}$/;
const messages:Record<string,string>={LOGIN_REQUIRED:'Please log in to upload a model.',UPGRADE_REQUIRED:'Model uploads need a database upgrade. Ask the administrator to apply migration 0007.',UPLOAD_PROVIDER:'Connect Dropbox in the workspace manager, then retry.',UPLOAD_QUOTA:'The test upload limit has been reached. Contact the administrator.',UPLOAD_OFFSET:'The upload was interrupted. Select the file again to restart.',UPLOAD_BUSY:'This upload is busy. Please wait.',UPLOAD_FINISH:'Dropbox completion is not confirmed. Wait one minute, then retry completion.',UPLOAD_IDENTITY:'Dropbox could not verify this model. Please retry.',UPLOAD_FORMAT:'Choose a valid STL or 3MF file.',VIEW_ONLY:'Workspace editing is disabled.',MODEL_UNAVAILABLE:'This model is unavailable.',PERMISSION_REQUIRED:'Your upload permission has changed. Please log in again.'};
async function api(path:string,init:RequestInit,signal:AbortSignal){
 const response=await fetch(path,{...init,signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
 const data=JSON.parse(new TextDecoder().decode(await readBoundedBytes(response,64*1024,signal)));
 if(!response.ok){const error=new Error(messages[data?.error?.code]||'The model request failed. Please retry.');error.name=data?.error?.code==='LOGIN_REQUIRED'?'LoginRequiredError':'Error';throw error;}return data;
}
export function validateAsset(value:any):UploadedModel {
 if(!value||!HEX.test(value.id)||!HEX.test(value.modelIdentity)||!['stl','3mf'].includes(value.extension)||value.identityKind!=='dropbox-block-sha256'||typeof value.name!=='string'||value.name.length>128||!Number.isSafeInteger(value.size)||value.size<1||value.size>150*1048576||!Number.isSafeInteger(value.createdAt))throw new Error('Invalid model catalog.');
 return {id:value.id,name:value.name,extension:value.extension,size:value.size,modelIdentity:value.modelIdentity,identityKind:value.identityKind,createdAt:value.createdAt};
}
export async function listModels(token:string|undefined,signal:AbortSignal):Promise<UploadedModel[]>{
 if(token&&!HEX.test(token))throw new Error('Invalid workspace.');const data=await api(token?`/api/shares/${token}/models`:'/api/shares/uploads',{},signal);
 if(!Array.isArray(data.items)||data.items.length>100)throw new Error('Invalid model catalog.');return data.items.map(validateAsset);
}
export async function uploadModel(file:File,options:{signal:AbortSignal;capabilities:GpuCapabilities|null;safeMode:boolean;workspaceToken?:string;onProgress?:(value:number)=>void;onSession?:(id:string)=>void}):Promise<UploadedModel>{
 if(!/\.(stl|3mf)$/i.test(file.name))throw new Error('Choose an STL or 3MF file.');
 await validateLocalFiles([file],getDeviceLoadProfile(options.capabilities,options.safeMode),{requireSelfContained:true,signal:options.signal});
 const requestKey=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const session=await api('/api/shares/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,size:file.size,requestKey,...(options.workspaceToken?{workspaceToken:options.workspaceToken}:{})})},options.signal);
 if(!HEX.test(session.id)||session.offset!==0||session.status!=='open')throw new Error('Invalid upload session.');options.onSession?.(session.id);
 for(let offset=0;offset<file.size;offset+=MODEL_BLOCK_BYTES){
  const end=Math.min(offset+MODEL_BLOCK_BYTES,file.size);const result=await api(`/api/shares/uploads/${session.id}`,{method:'PUT',headers:{'Upload-Offset':String(offset),'Content-Type':'application/octet-stream'},body:file.slice(offset,end)},options.signal);
  if(result.offset!==end)throw new Error('The upload position changed. Select the file again.');options.onProgress?.(Math.round(end/file.size*100));
 }
 return completeUpload(session.id,options.signal);
}
export async function completeUpload(id:string,signal:AbortSignal){if(!HEX.test(id))throw new Error('Invalid upload.');return validateAsset(await api(`/api/shares/uploads/${id}/complete`,{method:'POST'},signal));}
export async function cancelUpload(id:string){if(HEX.test(id))await api(`/api/shares/uploads/${id}`,{method:'DELETE'},new AbortController().signal);}
export async function downloadModel(asset:UploadedModel,token:string|undefined,options:{signal:AbortSignal;capabilities:GpuCapabilities|null;safeMode:boolean}):Promise<File>{
 validateAsset(asset);if(token&&!HEX.test(token))throw new Error('Invalid workspace.');
 const path=token?`/api/shares/${token}/models/${asset.id}/model.${asset.extension}`:`/api/shares/models/${asset.id}/model.${asset.extension}`;
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:options.signal});
 if(!response.ok){await response.body?.cancel();throw new Error('The uploaded model could not be opened.');}
 const bytes=await readBoundedBytes(response,getDeviceLoadProfile(options.capabilities,options.safeMode).hardLimitBytes,options.signal);
 if(await modelIdentity(bytes,asset.identityKind,options.signal)!==asset.modelIdentity)throw new Error('The uploaded model identity changed.');
 return new File([bytes],asset.name,{type:'application/octet-stream'});
}
