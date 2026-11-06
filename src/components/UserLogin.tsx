import { useEffect, useRef, useState } from 'react';
import { useUserSession } from '../context/UserSessionContext';

export function UserLogin() {
  const auth=useUserSession();
  const dialog=useRef<HTMLDialogElement|null>(null),usernameInput=useRef<HTMLInputElement|null>(null);
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  useEffect(()=>{
    if(auth.loginOpen){dialog.current?.showModal();usernameInput.current?.focus();}
    else{dialog.current?.close();setPassword('');setUsername('');}
  },[auth.loginOpen]);
  return <>
    {auth.user?<div className="flex min-h-11 items-center gap-2 text-xs">
      <span className="max-w-20 truncate sm:max-w-28" title={`Logged in as ${auth.user.username}`}>{auth.user.username}</span>
      <button disabled={auth.busy} onClick={()=>void auth.logout()} className="min-h-11 rounded border border-zinc-300 px-3 dark:border-zinc-700 disabled:opacity-50">Log out</button>
    </div>:<button disabled={auth.checking||auth.busy} onClick={auth.openLogin} className="min-h-11 rounded border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700 disabled:opacity-50">{auth.checking?'Checking login…':'Log in'}</button>}
    {auth.error&&!auth.loginOpen&&<span role="status" className="text-xs text-red-600">{auth.error}</span>}
    <dialog ref={dialog} aria-labelledby="user-login-title" onCancel={event=>{event.preventDefault();auth.closeLogin();}} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl border border-zinc-300 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      <form onSubmit={event=>{event.preventDefault();void auth.login(username,password).then(success=>{if(success)setPassword('');});}} className="space-y-4">
        <h2 id="user-login-title" className="text-lg font-semibold">Log in</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Use the sharing account assigned by your administrator.</p>
        <label className="block text-sm">Username<input ref={usernameInput} aria-label="Login username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required value={username} onChange={event=>setUsername(event.target.value)} disabled={auth.busy} className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"/></label>
        <label className="block text-sm">Password<input aria-label="Login password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={auth.busy} className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"/></label>
        {!auth.enabled&&!auth.checking&&<p className="text-sm">Login is available on environments configured for workspace sharing.</p>}
        {auth.error&&<p role="alert" className="text-sm text-red-600 dark:text-red-300">{auth.error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={auth.busy} onClick={auth.closeLogin} className="min-h-11 rounded border px-3">Cancel</button><button disabled={auth.busy||!username||password.length<12} className="min-h-11 rounded bg-blue-600 px-4 text-white disabled:opacity-50">{auth.busy?'Logging in…':'Log in'}</button></div>
      </form>
    </dialog>
  </>;
}
