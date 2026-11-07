import BoxConnectionPanel from './BoxConnectionPanel';
import { useEffect, useRef, useState } from 'react';
import { listManagedWorkspaces, revokeManagedWorkspace, revokeManagedWorkspaces, updateManagedWorkspace, createSharingUser, listSharingUsers, updateSharingUser, disableSharingUsers, type SharingUser, type ManagedWorkspace } from '../lib/shareAdmin';
function localDate(value:number):string {const date=new Date(value);return new Date(value-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function WorkspaceRow({row,busy,selected,onSelect,onUpdate,onRevoke}:{row:ManagedWorkspace;busy:boolean;selected:boolean;onSelect:()=>void;onUpdate:(label:string,expiry:string,enabled:boolean)=>Promise<boolean>;onRevoke:()=>void}) {
  const [label,setLabel]=useState(row.label),[expiry,setExpiry]=useState(localDate(row.expiresAt)),[enabled,setEnabled]=useState(!!row.editingEnabled);
  const [confirmRevoke,setConfirmRevoke]=useState(false);
  useEffect(()=>{setLabel(row.label);setExpiry(localDate(row.expiresAt));setEnabled(!!row.editingEnabled);},[row.revision,row.label,row.expiresAt]);
  const active=row.revokedAt===null&&row.expiresAt>Date.now(),modern=row.includeWorkspace!==undefined;
  return <article className="space-y-3 rounded-lg border border-zinc-300 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-3"><input aria-label={`Select ${row.label||'workspace'}`} type="checkbox" checked={selected} disabled={!active||busy} onChange={onSelect}/><span className="break-words font-semibold">{row.label||'Untitled workspace'}</span></label><span className="text-xs">{row.format.toUpperCase()} · {row.revokedAt!==null?'Revoked':active?'Active':'Expired'} · {modern?`version ${row.workspaceVersion}`:`revision ${row.revision}`}</span></div>
    <p className="text-xs text-zinc-600">Created {new Date(row.createdAt).toLocaleString()} · Updated {new Date(row.updatedAt).toLocaleString()}</p>
    {row.viewUrl?<label className="block text-sm">Public workspace link<input aria-label="Public workspace link" readOnly value={row.viewUrl} className="mt-1 w-full rounded border p-2 font-mono text-xs" onFocus={event=>event.target.select()}/></label>:<p className="text-xs">This older workspace has no recoverable address. Its existing public link still works.</p>}
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();void onUpdate(label,expiry,enabled);}}>
      <div className="flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm">Label<input value={label} maxLength={128} disabled={!active||busy} onChange={event=>setLabel(event.target.value)} className="mt-1 block min-h-11 w-full rounded border px-3"/></label>
      <label className="text-sm">Expiry<input aria-label="Workspace expiry" type="datetime-local" value={expiry} max={localDate(row.maxExpiresAt)} disabled={!active||busy} onChange={event=>setExpiry(event.target.value)} className="mt-1 block min-h-11 w-full rounded border px-3" required/></label></div>
      {modern&&<>
        <label className="flex min-h-11 items-center gap-3 text-sm">Editing permission<select aria-label="Workspace editing permission" value={enabled?'edit':'view'} onChange={event=>setEnabled(event.target.value==='edit')} disabled={!active||busy||!row.includeWorkspace} className="min-h-11 rounded border px-2"><option value="view">Public view only</option><option value="edit">Public view + public editing</option></select></label>
        {!row.includeWorkspace&&<p className="text-xs">Model-only link: analytics and revision history are excluded.</p>}
        <p className="text-xs text-zinc-600">Recipients never enter a password. Editing permission controls whether link holders may save. Sharing passwords are assigned per user below.</p>
      </>}
      <button disabled={!active||busy} className="min-h-11 rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50">Save settings</button>
    </form>
    <p className="text-xs text-zinc-600">Latest allowed expiry: {new Date(row.maxExpiresAt).toLocaleString()} (180 days from creation).</p>
    {!confirmRevoke?<button onClick={()=>setConfirmRevoke(true)} disabled={!active||busy} className="min-h-11 px-3 text-sm text-red-700 disabled:opacity-50">Revoke workspace…</button>:<div className="flex flex-wrap items-center gap-3"><span className="text-sm">Disable this link for everyone?</span><button onClick={onRevoke} disabled={busy} className="min-h-11 rounded bg-red-700 px-3 text-sm text-white">Confirm revoke</button><button onClick={()=>setConfirmRevoke(false)} className="min-h-11 px-3 text-sm underline">Cancel</button></div>}
  </article>;
}
function SharingUserRow({user,busy,selected,onSelect,onSave}:{user:SharingUser;busy:boolean;selected:boolean;onSelect:()=>void;onSave:(data:{password?:string;active?:boolean})=>Promise<boolean>}) {
  const [nextPassword,setNextPassword]=useState('');
  return <div className="space-y-2 rounded border p-3">
    <label className="flex min-h-11 items-center gap-3 font-semibold"><input aria-label={`Select sharing user ${user.username}`} type="checkbox" checked={selected} disabled={busy||!user.active} onChange={onSelect}/>{user.username} · {user.active?'Sharing allowed':'Sharing disabled'}</label>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();void onSave({password:nextPassword}).then(saved=>{if(saved)setNextPassword('');});}}>
      <label className="text-sm">New password for {user.username}<input aria-label={`New password for ${user.username}`} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={nextPassword} onChange={event=>setNextPassword(event.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded border px-3"/></label>
      <button disabled={busy||nextPassword.length<12} className="min-h-11 rounded border px-3">Change user password</button>
      <button type="button" disabled={busy} className="min-h-11 rounded border px-3" onClick={()=>void onSave({active:!user.active})}>{user.active?'Disable sharing user':'Enable sharing user'}</button>
    </form>
  </div>;
}
function SharingUsersPanel({adminPassword}:{adminPassword:string}) {
  const [users,setUsers]=useState<SharingUser[]>([]),[username,setUsername]=useState(''),[assignedPassword,setAssignedPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selected,setSelected]=useState<string[]>([]),[confirmDisable,setConfirmDisable]=useState(false);
  const request=useRef<AbortController|null>(null);
  const run=async(operation:(signal:AbortSignal)=>Promise<void>):Promise<boolean>=>{
    if(busy)return false;const controller=new AbortController();request.current=controller;setBusy(true);setMessage('');
    try{await operation(controller.signal);return !controller.signal.aborted;}catch(reason){if(!controller.signal.aborted)setMessage(reason instanceof Error?reason.message:'Sharing user request failed.');return false;}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const refresh=async(signal:AbortSignal)=>{const result=await listSharingUsers(adminPassword,signal);if(!signal.aborted){setUsers(result);setSelected([]);setConfirmDisable(false);}};
  useEffect(()=>{void run(refresh);return()=>request.current?.abort();},[]);
  return <section className="space-y-3 rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Sharing users</h2>
    <p className="text-sm">Assign a different username and password to each person allowed to publish workspace links. The admin password cannot publish workspaces. Disabling a user stops future sharing actions; revoke their workspace links separately to stop recipient access.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();void run(async signal=>{await createSharingUser(adminPassword,username,assignedPassword,signal);await refresh(signal);if(!signal.aborted){setUsername('');setAssignedPassword('');setMessage('Sharing user created. Deliver the credentials privately.');}});}}>
      <label className="text-sm">New sharing username<input aria-label="New sharing username" pattern="[a-z][a-z0-9._-]{2,63}" minLength={3} maxLength={64} required value={username} onChange={event=>setUsername(event.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded border px-3"/></label>
      <label className="text-sm">Assign sharing password<input aria-label="Assign sharing password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={assignedPassword} onChange={event=>setAssignedPassword(event.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded border px-3"/></label>
      <button disabled={busy||!username||assignedPassword.length<12} className="min-h-11 rounded bg-blue-600 px-4 text-white disabled:opacity-50">Add sharing user</button>
    </form>
    <p className="text-xs">Use 3–64 lowercase username characters, starting with a letter. Passwords: 12–128 characters. Up to 50 sharing users.</p>
    <button disabled={busy} className="min-h-11 rounded border px-3" onClick={()=>void run(refresh)}>Refresh sharing users</button>
    <div className="flex flex-wrap items-center gap-3"><button disabled={busy||!users.some(user=>user.active)} className="min-h-11 rounded border px-3" onClick={()=>{setSelected(users.filter(user=>user.active).map(user=>user.id));setConfirmDisable(false);}}>Select active sharing users</button><button disabled={busy||!selected.length} className="min-h-11 rounded border px-3" onClick={()=>setConfirmDisable(true)}>Disable selected users ({selected.length})…</button></div>
    {confirmDisable&&<div className="flex flex-wrap items-center gap-3"><p>Disable sharing for {selected.length} selected users? Existing public links remain available.</p><button disabled={busy} className="min-h-11 rounded bg-red-700 px-3 text-white" onClick={()=>void run(async signal=>{await disableSharingUsers(adminPassword,selected,signal);await refresh(signal);if(!signal.aborted)setMessage('Selected sharing users disabled.');})}>Confirm disable users</button><button className="min-h-11 px-3 underline" onClick={()=>setConfirmDisable(false)}>Cancel</button></div>}
    {users.map(user=><SharingUserRow key={user.id} user={user} busy={busy} selected={selected.includes(user.id)} onSelect={()=>{setConfirmDisable(false);setSelected(previous=>previous.includes(user.id)?previous.filter(id=>id!==user.id):[...previous,user.id]);}} onSave={data=>run(async signal=>{await updateSharingUser(adminPassword,user,data,signal);await refresh(signal);if(!signal.aborted)setMessage('Sharing user updated.');})}/>)}
    {message&&<p role="status" className="text-sm">{message}</p>}
  </section>;
}
export default function ShareAdminPage() {
  const [input,setInput]=useState(''),[password,setPassword]=useState(''),[rows,setRows]=useState<ManagedWorkspace[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selected,setSelected]=useState<string[]>([]),[confirmBatch,setConfirmBatch]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>{request.current?.abort();},[]);
  const run=async(operation:(signal:AbortSignal)=>Promise<void>):Promise<boolean>=>{
    if(busy)return false;const controller=new AbortController();request.current=controller;setBusy(true);setMessage('');
    try{await operation(controller.signal);return !controller.signal.aborted;}catch(reason){if(!controller.signal.aborted)setMessage(reason instanceof Error?reason.message:'The workspace request failed.');return false;}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const refresh=async(key:string,signal:AbortSignal,page?:string)=>{const data=await listManagedWorkspaces(key,signal,page);if(!signal.aborted){setRows(previous=>page?[...previous,...data.items]:data.items);setCursor(data.nextCursor);if(!page){setSelected([]);setConfirmBatch(false);}}};
  const activeRows=rows.filter(row=>row.revokedAt===null&&row.expiresAt>Date.now());
  const modern=rows.some(row=>row.includeWorkspace!==undefined);
  return <main className="h-dvh overflow-y-auto overscroll-y-contain bg-zinc-50 p-4 text-zinc-900 sm:p-8"><div className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">Protected workspaces</h1><a href="/" className="min-h-11 content-center text-sm text-blue-700 underline">Open viewer / create workspace</a></header>
    <p className="text-sm">Manage public links, editing permissions, passwords and expiry. Files remain at Dropbox. Revocation disables a selected workspace for all link holders; display names are not user accounts.</p>
    {!password?<form className="max-w-lg space-y-3 rounded-lg border bg-white p-4" onSubmit={event=>{event.preventDefault();void run(async signal=>{await refresh(input,signal);if(!signal.aborted){setPassword(input);setInput('');}});}}>
      <label className="block text-sm">Creator/admin password<input aria-label="Admin creator password" type="password" autoComplete="off" maxLength={256} value={input} onChange={event=>setInput(event.target.value)} className="mt-1 block min-h-11 w-full rounded border px-3"/></label>
      <p className="text-xs text-zinc-600">Kept only in this page’s memory. This password remains separate from users’ sharing passwords.</p>
      <button disabled={busy||input.length<32} className="min-h-11 rounded bg-blue-600 px-4 text-white disabled:opacity-50">{busy?'Opening…':'Open workspace manager'}</button>
    </form>:<>
      <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void run(signal=>refresh(password,signal))} className="min-h-11 rounded border px-3">Refresh</button><button onClick={()=>{request.current?.abort();setBusy(false);setPassword('');setInput('');setRows([]);setCursor(null);setSelected([]);setMessage('');setConfirmBatch(false);}} className="min-h-11 px-3 underline">Lock manager</button></div>
      <BoxConnectionPanel adminPassword={password}/>
      <SharingUsersPanel adminPassword={password}/>
      {modern&&<section className="flex flex-wrap items-center gap-3 rounded border border-red-200 bg-white p-3">
        <button className="min-h-11 rounded border px-3" disabled={busy||!activeRows.length} onClick={()=>{setSelected(activeRows.slice(0,50).map(row=>row.id));setConfirmBatch(false);}}>Select active links (up to 50)</button>
        <button className="min-h-11 px-3 underline" disabled={busy||!selected.length} onClick={()=>{setSelected([]);setConfirmBatch(false);}}>Clear selection</button>
        {!confirmBatch?<button className="min-h-11 rounded bg-red-700 px-3 text-white disabled:opacity-50" disabled={busy||!selected.length} onClick={()=>setConfirmBatch(true)}>Revoke selected ({selected.length})…</button>:<><p className="w-full text-sm">Revoke {selected.length} selected links for everyone? Viewing, editing and history access will stop.</p><button className="min-h-11 rounded bg-red-700 px-3 text-white" disabled={busy} onClick={()=>void run(async signal=>{await revokeManagedWorkspaces(selected,password,signal);await refresh(password,signal);if(!signal.aborted)setMessage('Selected workspaces revoked for everyone.');})}>Confirm batch revoke</button><button className="min-h-11 px-3 underline" onClick={()=>setConfirmBatch(false)}>Cancel</button></>}
      </section>}
      {!rows.length&&!busy&&<p>No workspaces found. Create a public link from a loaded Dropbox model in the viewer.</p>}
      {rows.map(row=><WorkspaceRow key={row.id} row={row} busy={busy} selected={selected.includes(row.id)} onSelect={()=>{setConfirmBatch(false);setSelected(previous=>previous.includes(row.id)?previous.filter(id=>id!==row.id):previous.length<50?[...previous,row.id]:previous);}} onUpdate={(label,expiry,enabled)=>run(async signal=>{
        const parsed=expiry===localDate(row.expiresAt)?new Date(row.expiresAt):new Date(expiry);if(!Number.isFinite(parsed.getTime()))throw new Error('Enter a valid expiry date and time.');
        await updateManagedWorkspace(row.id,password,{revision:row.revision,label,expiresAt:parsed.toISOString(),...(row.includeWorkspace!==undefined&&enabled!==!!row.editingEnabled?{editingEnabled:enabled}:{})},signal);
        await refresh(password,signal);if(!signal.aborted)setMessage('Workspace settings saved.');
      })} onRevoke={()=>void run(async signal=>{await revokeManagedWorkspace(row.id,password,signal);await refresh(password,signal);if(!signal.aborted)setMessage('Workspace revoked for everyone.');})}/>)}
      {cursor&&<button disabled={busy} onClick={()=>void run(signal=>refresh(password,signal,cursor))} className="min-h-11 rounded border px-4">Load more workspaces</button>}
    </>}
    {message&&<p role="status" className="rounded border border-blue-300 bg-white p-3 text-sm">{message}</p>}
  </div></main>;
}
