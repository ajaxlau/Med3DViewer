import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getUserSession, loginUser, logoutUser, type SignedInUser } from '../lib/userSession';

interface UserSessionState {
  user: SignedInUser|null;
  checking: boolean;
  busy: boolean;
  enabled: boolean;
  loginOpen: boolean;
  error: string;
  openLogin: ()=>void;
  closeLogin: ()=>void;
  login: (username:string,password:string)=>Promise<boolean>;
  logout: ()=>Promise<void>;
  hasPermission: (permission:string)=>boolean;
  requireLogin: ()=>void;
}
const Context=createContext<UserSessionState|null>(null);
export function UserSessionProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<SignedInUser|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false);
  const [loginOpen,setLoginOpen]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null),mutating=useRef(false),lastCheck=useRef(0);
  const refresh=useCallback(async()=>{
    if(mutating.current)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;
    try {const status=await getUserSession(controller.signal);if(!controller.signal.aborted){setUser(status.user);setEnabled(status.enabled);lastCheck.current=Date.now();}}
    catch {if(!controller.signal.aborted){setUser(null);setEnabled(false);}}
    finally {if(!controller.signal.aborted)setChecking(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const onFocus=()=>{if(document.visibilityState==='visible'&&Date.now()-lastCheck.current>60_000)void refresh();};
    window.addEventListener('focus',onFocus);
    return()=>{request.current?.abort();window.removeEventListener('focus',onFocus);};
  },[refresh]);
  useEffect(()=>{
    if(!user)return;
    const timer=window.setTimeout(()=>setUser(null),Math.max(0,Date.parse(user.expiresAt)-Date.now()));
    return()=>window.clearTimeout(timer);
  },[user]);
  const login=async(username:string,password:string)=>{
    if(mutating.current)return false;
    mutating.current=true;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    try {const status=await loginUser(username,password,controller.signal);if(controller.signal.aborted)return false;
      setUser(status.user);setEnabled(status.enabled);setChecking(false);setLoginOpen(false);lastCheck.current=Date.now();return true;
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Login failed.');return false;}
    finally{mutating.current=false;if(!controller.signal.aborted)setBusy(false);}
  };
  const logout=async()=>{
    if(mutating.current)return;
    mutating.current=true;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    try{await logoutUser(controller.signal);if(!controller.signal.aborted)setUser(null);}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Logout failed. Try again.');}
    finally{mutating.current=false;if(!controller.signal.aborted)setBusy(false);}
  };
  return <Context.Provider value={{user,checking,busy,enabled,loginOpen,error,login,logout,
    openLogin:()=>{setError('');setLoginOpen(true);},closeLogin:()=>{if(!mutating.current){setLoginOpen(false);setError('');}},
    hasPermission:permission=>!!user&&Date.parse(user.expiresAt)>Date.now()&&user.permissions.includes(permission),
    requireLogin:()=>{setUser(null);setError('Your session expired or access changed. Log in again.');setLoginOpen(true);}
  }}>{children}</Context.Provider>;
}
export function useUserSession():UserSessionState {
  const context=useContext(Context);
  if(!context)throw new Error('UserSessionProvider is required.');
  return context;
}
