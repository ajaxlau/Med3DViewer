export const WORKSPACE_MAX_AGE_MS = 180 * 86_400_000;
export function localDateTime(value: number): string {
  const date=new Date(value);
  return new Date(value-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
export function defaultWorkspaceName(filename: string|null): string {
  return (filename?.replace(/\.[^/.]+$/,'').trim() || 'Workspace').slice(0,128);
}
export function workspaceExpiry(value: string,now=Date.now()): string {
  const date=new Date(value),timestamp=date.getTime();
  if(!value||!Number.isFinite(timestamp)||timestamp<=now||timestamp>now+WORKSPACE_MAX_AGE_MS)throw new Error('Choose a future expiry within 180 days from creation.');
  return date.toISOString();
}
