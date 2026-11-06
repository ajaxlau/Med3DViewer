import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspaceName,localDateTime,workspaceExpiry,WORKSPACE_MAX_AGE_MS } from '../src/lib/workspaceSharing';
test('workspace names default to the model basename and stay within the stored label limit',()=>{
  assert.equal(defaultWorkspaceName('Multi mesh model.3mf'),'Multi mesh model');assert.equal(defaultWorkspaceName(null),'Workspace');assert.equal(defaultWorkspaceName('x'.repeat(200)+'.stl').length,128);
});
test('mobile date/time input preserves browser local time and validates the 180-day limit',()=>{
  const now=Date.parse('2026-11-06T12:00:00Z'),selected=localDateTime(now+7*86_400_000);
  assert.equal(Date.parse(workspaceExpiry(selected,now)),now+7*86_400_000);
  for(const value of ['',localDateTime(now-60_000),localDateTime(now+WORKSPACE_MAX_AGE_MS+60_000),'invalid'])assert.throws(()=>workspaceExpiry(value,now),/180 days/);
  assert.equal(Date.parse(workspaceExpiry(localDateTime(now+WORKSPACE_MAX_AGE_MS),now)),now+WORKSPACE_MAX_AGE_MS);
});
