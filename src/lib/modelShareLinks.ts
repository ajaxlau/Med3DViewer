import { validateSharedWorkspace } from './planningData';

export interface ModelShareLink { url:string; token:string; expiresAt:string }
interface ModelReferenceManager { getModelRoot?:()=>any }
export function modelOnlySnapshot(manager:ModelReferenceManager) {
  const root=manager.getModelRoot?.();
  root?.updateMatrixWorld?.(true);
  return validateSharedWorkspace({schemaVersion:1,
    modelMatrix:root?.matrixWorld?.toArray?.()||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    coordinateSystem:{systemType:'Viewer world with recorded model root',units:'millimeters (mm)'},objects:[],groups:[]});
}
export class ModelShareLinkCache {
  private entries=new Map<string,{promise:Promise<ModelShareLink>;link?:ModelShareLink}>();
  constructor(private now=Date.now){}
  get(key:string,create:()=>Promise<ModelShareLink>):Promise<ModelShareLink> {
    const prior=this.entries.get(key);
    if(prior&&(!prior.link||Date.parse(prior.link.expiresAt)>this.now()))return prior.promise;
    const entry:{promise:Promise<ModelShareLink>;link?:ModelShareLink}={promise:Promise.resolve().then(create)};
    entry.promise=entry.promise.then(link=>{entry.link=link;return link;}).catch(error=>{if(this.entries.get(key)===entry)this.entries.delete(key);throw error;});
    this.entries.set(key,entry);
    while(this.entries.size>8)this.entries.delete(this.entries.keys().next().value!);
    return entry.promise;
  }
}
const caches=new WeakMap<object,ModelShareLinkCache>();
export function modelShareLinks(manager:object):ModelShareLinkCache {
  let cache=caches.get(manager);if(!cache){cache=new ModelShareLinkCache();caches.set(manager,cache);}return cache;
}
