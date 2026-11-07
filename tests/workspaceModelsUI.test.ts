import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('Workspace Revision exposes local imports to recipients and Dropbox uploads only to signed-in users',async()=>{
 const result=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {WorkspaceModelsPanel} from './src/components/WorkspaceModelsPanel';import {SharedWorkspaceBar} from './src/components/SharedWorkspaceBar';
 export function render(session){const model=<WorkspaceModelsPanel session={session} embedded={!!session} onLoad={async()=>{}} onLocal={async()=>{}} onUrl={async()=>{}}/>;return renderToStaticMarkup(session?<SharedWorkspaceBar session={session} manager={globalThis.__workspaceFixture.viewer.viewerManager} modelControls={model} onSaved={()=>{}}/>:model);}`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(process.cwd()+'/package.json');"},write:false,jsx:'automatic',plugins:[{name:'context-fixtures',setup(plugin){plugin.onResolve({filter:/(Viewer|UserSession)Context$/},args=>({path:args.path.includes('UserSession')?'auth':'viewer',namespace:'fixture'}));plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?'export function useUserSession(){return globalThis.__workspaceFixture.auth;}':'export function useViewer(){return globalThis.__workspaceFixture.viewer;}'}));}}]});
 const {render}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
 const fixture:any={viewer:{viewerManager:{modelLoadState:{requestId:'ready',phase:'ready'},loadedModelIdentity:'b'.repeat(64)}},auth:{user:null,hasPermission:()=>false}};
 (globalThis as any).__workspaceFixture=fixture;
 const session={token:'a'.repeat(64),role:'view',historyEnabled:true,includeWorkspace:true,editingEnabled:true,revision:1,workspaceVersion:1,modelIdentity:'b'.repeat(64),requestId:'ready',expiresAt:'2099-01-01'};
 const guest=render(session);assert.match(guest,/Workspace Revision/);assert.match(guest,/Open local model/);assert.match(guest,/Open Dropbox link/);assert(!guest.includes('Upload to Dropbox'));assert.match(guest,/Save Workspace/);
 const local=render({...session,localDraft:true});assert.match(local,/Local model only/);assert(!local.includes('Save Workspace'));
 fixture.auth={user:{id:'owner'},hasPermission:()=>true};const owner=render(null);assert.match(owner,/Workspace Revision/);assert.match(owner,/Open local model/);assert.match(owner,/Upload to Dropbox/);assert(!owner.includes('Save Workspace'));
 // In-flight replacement must keep its controls mounted, allowing cancellation.
 fixture.viewer.viewerManager.modelLoadState={requestId:'loading',phase:'parsing'};const loading=render(session);assert.match(loading,/Open local model/);assert(!loading.includes('Save Workspace'));
 delete(globalThis as any).__workspaceFixture;
});
