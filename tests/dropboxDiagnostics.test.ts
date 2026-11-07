import test from 'node:test';
import assert from 'node:assert/strict';
import { dropboxFailureHint, safeDropboxReason } from '../src/lib/dropboxDiagnostics';
test('diagnostic labels allow only fixed stages, reason codes and HTTP statuses',()=>{
 assert.equal(dropboxFailureHint('?dropbox=connected'),null);
 assert.equal(safeDropboxReason('DROPBOX_CLIENT_REJECTED'),'DROPBOX_CLIENT_REJECTED');
 assert.equal(safeDropboxReason('DROPBOX_HTTP_401'),'DROPBOX_HTTP_401');
 const known=dropboxFailureHint('?dropbox=failed&stage=token-exchange&reason=DROPBOX_CLIENT_REJECTED');
 assert.match(known!,/token exchange/);assert.match(known!,/App key and App secret/);
 for(const bad of ['__proto__','constructor','SECRET-token','<script>alert(1)</script>','DROPBOX_HTTP_200']) {
  const hint=dropboxFailureHint('?'+new URLSearchParams({dropbox:'failed',stage:bad,reason:bad,token:'PRIVATE-VALUE'}));
  assert.match(hint!,/DROPBOX_INTERNAL_FAILED/);assert(!hint!.includes(bad));assert(!hint!.includes('PRIVATE-VALUE'));
 }
});
