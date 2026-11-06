import { useEffect,useRef,useState } from 'react';
import { UserRound } from 'lucide-react';
import { useUserSession } from '../context/UserSessionContext';
import { Tooltip } from './Tooltip';

export function UserLogin() {
  const auth=useUserSession();
  const dialog=useRef<HTMLDialogElement|null>(null),usernameInput=useRef<HTMLInputElement|null>(null);
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[accountOpen,setAccountOpen]=useState(false);
  const open=auth.loginOpen||accountOpen;
  const close=()=>{if(!auth.busy){auth.closeLogin();setAccountOpen(false);}};
  useEffect(()=>{
    if(open){if(!dialog.current?.open)dialog.current?.showModal();if(auth.loginOpen)usernameInput.current?.focus();}
    else{dialog.current?.close();setPassword('');setUsername('');}
  },[open,auth.loginOpen]);
  useEffect(()=>{if(!auth.user)setAccountOpen(false);},[auth.user]);
  return <>
    <Tooltip content={auth.user?'Account':'Log in'}>
      <button aria-label={auth.user?'Account':'Log in'} title={auth.user?auth.user.username:'Log in'} disabled={auth.checking||auth.busy}
        onClick={()=>{if(auth.user)setAccountOpen(true);else auth.openLogin();}}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400 disabled:opacity-50 ${auth.user?'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400':''}`}>
        <UserRound size={18}/>
      </button>
    </Tooltip>
    <dialog ref={dialog} aria-labelledby="user-login-title" onCancel={event=>{event.preventDefault();close();}} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl border border-zinc-300 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      {auth.loginOpen?<form onSubmit={event=>{event.preventDefault();void auth.login(username,password).then(success=>{if(success)setPassword('');});}} className="space-y-4">
        <h2 id="user-login-title" className="text-lg font-semibold">Log in</h2>
        <label className="block text-sm">Username<input ref={usernameInput} aria-label="Login username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required value={username} onChange={event=>setUsername(event.target.value)} disabled={auth.busy} className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"/></label>
        <label className="block text-sm">Password<input aria-label="Login password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={auth.busy} className="mt-1 block min-h-11 w-full rounded border bg-transparent px-3"/></label>
        {auth.error&&<p role="alert" className="text-sm text-red-600 dark:text-red-300">{auth.error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={auth.busy} onClick={close} className="min-h-11 rounded border px-3">Cancel</button><button disabled={auth.busy||!username||password.length<12} className="min-h-11 rounded bg-blue-600 px-4 text-white disabled:opacity-50">{auth.busy?'Logging in…':'Log in'}</button></div>
      </form>:<div className="space-y-4">
        <h2 id="user-login-title" className="text-lg font-semibold">Account</h2>
        <p className="break-words text-sm">{auth.user?.username}</p>
        {auth.error&&<p role="alert" className="text-sm text-red-600">{auth.error}</p>}
        <div className="flex justify-end gap-3"><button disabled={auth.busy} onClick={close} className="min-h-11 rounded border px-3">Close</button><button disabled={auth.busy} onClick={()=>void auth.logout()} className="min-h-11 rounded bg-blue-600 px-4 text-white disabled:opacity-50">Log out</button></div>
      </div>}
    </dialog>
  </>;
}
