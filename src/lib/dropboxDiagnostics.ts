// Public diagnostic labels only. Never render provider descriptions, URLs or tokens.
const stages: Record<string, string> = {
  consent: 'Dropbox consent', 'token-exchange': 'token exchange',
  'account-check': 'account check', 'folder-check': 'app-folder check',
  'save-connection': 'saving the connection',
};
const hints: Record<string, string> = {
  DROPBOX_DENIED: 'Start Connect Dropbox again and approve access.',
  DROPBOX_CLIENT_REJECTED: 'Check that the runtime App key and App secret belong to the same Dropbox app.',
  DROPBOX_GRANT_REJECTED: 'Start a fresh connection; the authorization code was rejected.',
  DROPBOX_SCOPE_REQUIRED: 'Enable and save the four required Dropbox permissions, then reconnect.',
  DROPBOX_TOKEN_INVALID: 'Dropbox returned credentials the platform could not validate.',
  DROPBOX_ACCOUNT_MISMATCH: 'Reconnect the original Dropbox account.',
  DROPBOX_FOLDER_PERMISSION: 'Check the Dropbox app-folder permissions.',
  DROPBOX_REQUEST_FAILED: 'Dropbox could not complete the request. Try again later.',
  DROPBOX_RESPONSE_INVALID: 'Dropbox returned an unexpected response.',
  DROPBOX_CONNECTION_CHANGED: 'Another connection action interrupted this attempt. Start again.',
  DROPBOX_INTERNAL_FAILED: 'The platform could not finish the connection. Report this diagnostic.',
};
export function safeDropboxReason(value: string): string {
  return Object.hasOwn(hints, value) || /^DROPBOX_HTTP_[45][0-9]{2}$/.test(value) ? value : 'DROPBOX_INTERNAL_FAILED';
}
export function dropboxFailureHint(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('dropbox') !== 'failed') return null;
  const code = safeDropboxReason(params.get('reason') || '');
  const label = Object.hasOwn(stages, params.get('stage') || '') ? stages[params.get('stage')!] : 'authorization';
  return `Dropbox authorization failed at ${label} (${code}). ${hints[code] || 'Dropbox rejected the request. Report this diagnostic.'}`;
}
