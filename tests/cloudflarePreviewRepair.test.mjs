import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPreviewTrigger, repairPreviewTrigger, cloudflareApi, buildLogLines, inspectDeploymentTokens,
  BAD_COMMAND, PREVIEW_COMMAND, PREVIEW_BRANCH, FAILED_BUILD_ID,
  INVALID_DEPLOY_TOKEN_UUID, WORKER_DEPLOY_TOKEN_UUID, MED3DVIEWER_DEPLOY_TOKEN_UUID,
} from '../scripts/repair-cloudflare-preview.mjs';

const tag = 'a'.repeat(32);
const uuid = '11111111-1111-1111-1111-111111111111';
const commit = 'b'.repeat(40);
const trigger = () => ({
  trigger_uuid: uuid, external_script_id: tag,
  repo_connection: { provider_account_name: 'ajaxlau', repo_name: 'Med3DViewer' },
  branch_includes: ['*'], branch_excludes: ['main'],
  build_command: 'npm run build:cloudflare', deploy_command: BAD_COMMAND,
  root_directory: '/',
});

function fakeApi({ initial = trigger(), retainPatch = true, tokens = [{ build_token_uuid: WORKER_DEPLOY_TOKEN_UUID, build_token_name: 'ntec3dpo-m3dv build token', owner_type: 'user' }] } = {}) {
  let stored = structuredClone(initial);
  const calls = [];
  const api = async (method, resource, body) => {
    calls.push({ method, resource, body });
    if (method === 'GET' && resource === `/builds/builds/${FAILED_BUILD_ID}`) return {
      build_trigger_metadata: { branch: PREVIEW_BRANCH, provider_account_name: 'ajaxlau', repo_name: 'Med3DViewer', deploy_command: BAD_COMMAND },
      trigger: { external_script_id: tag, trigger_uuid: uuid },
    };
    if (method === 'GET' && resource.endsWith('/triggers')) return [structuredClone(stored)];
    if (method === 'GET' && resource.endsWith('/environment_variables')) return {};
    if (method === 'GET' && resource === '/builds/tokens?per_page=200') return structuredClone(tokens);
    if (method === 'PATCH') {
      if (retainPatch) stored = { ...stored, ...body };
      return structuredClone(stored);
    }
    if (method === 'POST' && resource.endsWith('/builds')) return { build_uuid: '22222222-2222-2222-2222-222222222222' };
    throw new Error('Unexpected fake API request.');
  };
  return { api, calls };
}

test('production and unexcluded wildcard triggers cannot be modified', async () => {
  for (const initial of [{ ...trigger(), branch_includes: ['main'], branch_excludes: [] }, { ...trigger(), branch_excludes: [] }]) {
    assert.throws(() => assertPreviewTrigger(initial, tag));
    const mock = fakeApi({ initial });
    await assert.rejects(repairPreviewTrigger({ api: mock.api, apply: true }), /exactly one matching preview trigger/);
    assert.equal(mock.calls.some(c => c.method !== 'GET'), false);
  }
});

test('wrong repository, Worker, root, or unknown command are rejected', () => {
  for (const modified of [
    { ...trigger(), repo_connection: { provider_account_name: 'another-owner', repo_name: 'Med3DViewer' } },
    { ...trigger(), external_script_id: 'c'.repeat(32) },
    { ...trigger(), root_directory: '/other-app' },
    { ...trigger(), deploy_command: 'npx wrangler deploy' },
    { ...trigger(), deleted_on: '2026-10-26' },
  ]) assert.throws(() => assertPreviewTrigger(modified, tag));
});

test('the API-confirmed exact PR #10 branch trigger is safe without a main exclusion', async () => {
  const initial = { ...trigger(), branch_includes: [PREVIEW_BRANCH], branch_excludes: [] };
  const mock = fakeApi({ initial });
  await repairPreviewTrigger({ api: mock.api, apply: true });
  assert.deepEqual(mock.calls.filter(c => c.method === 'PATCH'), [{
    method: 'PATCH', resource: `/builds/triggers/${uuid}`,
    body: { deploy_command: PREVIEW_COMMAND },
  }]);
  assert.throws(() => assertPreviewTrigger({ ...initial, branch_includes: ['another-feature'] }, tag));
  assert.throws(() => assertPreviewTrigger({ ...initial, branch_includes: [PREVIEW_BRANCH, 'main'] }, tag));
});

test('inspection is read-only by default', async () => {
  const mock = fakeApi();
  const result = await repairPreviewTrigger({ api: mock.api });
  assert.equal(result.inspectionOnly, true);
  assert.equal(mock.calls.every(c => c.method === 'GET'), true);
});

test('apply patches only the preview command and verifies before starting a feature build', async () => {
  const mock = fakeApi();
  await repairPreviewTrigger({ api: mock.api, apply: true, startBuild: true, commitHash: commit });
  const patches = mock.calls.filter(c => c.method === 'PATCH');
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0], { method: 'PATCH', resource: `/builds/triggers/${uuid}`, body: { deploy_command: PREVIEW_COMMAND } });
  const posts = mock.calls.filter(c => c.method === 'POST');
  assert.deepEqual(posts, [{ method: 'POST', resource: `/builds/triggers/${uuid}/builds`, body: { branch: PREVIEW_BRANCH, commit_hash: commit } }]);
});

test('a corrected trigger is idempotent and main cannot be built', async () => {
  const mock = fakeApi({ initial: { ...trigger(), deploy_command: PREVIEW_COMMAND } });
  const result = await repairPreviewTrigger({ api: mock.api, apply: true });
  assert.equal(result.changed, false);
  assert.equal(mock.calls.some(c => c.method === 'PATCH'), false);
  await assert.rejects(repairPreviewTrigger({ api: mock.api, apply: true, startBuild: true, branch: 'main', commitHash: commit }), /Only the PR #10/);
});

test('failed readback prevents a build from starting', async () => {
  const mock = fakeApi({ retainPatch: false });
  await assert.rejects(repairPreviewTrigger({ api: mock.api, apply: true, startBuild: true, commitHash: commit }), /did not retain/);
  assert.equal(mock.calls.some(c => c.method === 'POST'), false);
});

test('API errors redact the credential and missing credentials fail before requests', async () => {
  assert.throws(() => cloudflareApi(''), /CF_BUILDS_REPAIR_TOKEN/);
  const token = 'test-credential-never-print';
  const api = cloudflareApi(token, async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ code: 10000, message: `Refused ${token}` }] }) }));
  await assert.rejects(api('GET', '/builds/builds/example'), error => error.message.includes('[REDACTED]') && !error.message.includes(token));
});

test('Cloudflare timestamp/message tuples preserve actual build errors', () => {
  assert.deepEqual(buildLogLines({ lines: [
    [1700000000, 'Executing user deploy command: npx wrangler preview'],
    [1700000001, '[ERROR] Authentication failed'],
    'plain message', { line: 'object message' }, null, [1700000002],
  ] }), [
    'Executing user deploy command: npx wrangler preview',
    '[ERROR] Authentication failed', 'plain message', 'object message',
  ]);
});

test('deployment token and build-variable inspection is read-only and never reports values', async () => {
  const mock = fakeApi();
  const reports = [];
  const api = async (method, resource, body) => {
    if (resource.endsWith('/environment_variables')) {
      assert.equal(method, 'GET');
      return {
        CLOUDFLARE_API_TOKEN: { value: 'must-never-appear', is_secret: false },
        OTHER_SECRET: { value: 'must-never-appear', is_secret: true },
      };
    }
    if (resource === '/builds/tokens?per_page=200') {
      assert.equal(method, 'GET');
      return [{ build_token_uuid: uuid, build_token_name: 'Build token', owner_type: 'user', unexpected_secret: 'must-never-appear' }];
    }
    return mock.api(method, resource, body);
  };
  await inspectDeploymentTokens(api, value => reports.push(value));
  assert.equal(mock.calls.every(call => call.method === 'GET'), true);
  assert.equal(JSON.stringify(reports).includes('must-never-appear'), false);
  assert.deepEqual(reports.find(report => report.build_variables), { build_variables: [
    { name: 'CLOUDFLARE_API_TOKEN', is_secret: false },
    { name: 'OTHER_SECRET', is_secret: true },
  ] });
  assert.deepEqual(reports.at(-1), { deployment_token: { build_token_uuid: uuid, build_token_name: 'Build token', owner_type: 'user' } });
});

test('only the identified stale token can be replaced with the registered Worker token', async () => {
  const initial = { ...trigger(), deploy_command: PREVIEW_COMMAND, build_token_uuid: INVALID_DEPLOY_TOKEN_UUID };
  const mock = fakeApi({ initial });
  await repairPreviewTrigger({ api: mock.api, apply: true, useWorkerToken: true });
  assert.deepEqual(mock.calls.filter(call => call.method === 'PATCH'), [{
    method: 'PATCH', resource: `/builds/triggers/${uuid}`,
    body: { build_token_uuid: WORKER_DEPLOY_TOKEN_UUID },
  }]);
  const unknown = fakeApi({ initial: { ...initial, build_token_uuid: uuid } });
  await assert.rejects(repairPreviewTrigger({ api: unknown.api, apply: true, useWorkerToken: true }), /Unexpected deployment-token binding/);
  assert.equal(unknown.calls.some(call => call.method === 'PATCH'), false);
});

test('unverified token metadata and failed token readback prevent uploads', async () => {
  const initial = { ...trigger(), deploy_command: PREVIEW_COMMAND, build_token_uuid: INVALID_DEPLOY_TOKEN_UUID };
  const wrongName = fakeApi({ initial, tokens: [{ build_token_uuid: WORKER_DEPLOY_TOKEN_UUID, build_token_name: 'another-worker', owner_type: 'user' }] });
  await assert.rejects(repairPreviewTrigger({ api: wrongName.api, apply: true, useWorkerToken: true }), /not registered/);
  assert.equal(wrongName.calls.some(call => call.method === 'PATCH'), false);
  const notRetained = fakeApi({ initial, retainPatch: false });
  await assert.rejects(repairPreviewTrigger({ api: notRetained.api, apply: true, useWorkerToken: true, startBuild: true, commitHash: commit }), /did not retain the selected deployment token/);
  assert.equal(notRetained.calls.some(call => call.method === 'POST'), false);
});

test('the owner-selected med3dviewer token is verified and retained before starting a preview', async () => {
  const initial = { ...trigger(), deploy_command: PREVIEW_COMMAND, build_token_uuid: WORKER_DEPLOY_TOKEN_UUID };
  const tokens = [{ build_token_uuid: MED3DVIEWER_DEPLOY_TOKEN_UUID, build_token_name: 'med3dviewer build token', owner_type: 'user' }];
  const mock = fakeApi({ initial, tokens });
  await repairPreviewTrigger({ api: mock.api, apply: true, useMed3dviewerToken: true, startBuild: true, commitHash: commit });
  assert.deepEqual(mock.calls.filter(call => call.method === 'PATCH'), [{
    method: 'PATCH', resource: `/builds/triggers/${uuid}`,
    body: { build_token_uuid: MED3DVIEWER_DEPLOY_TOKEN_UUID },
  }]);
  assert.equal(mock.calls.filter(call => call.method === 'POST').length, 1);
  const notRetained = fakeApi({ initial, tokens, retainPatch: false });
  await assert.rejects(repairPreviewTrigger({ api: notRetained.api, apply: true, useMed3dviewerToken: true, startBuild: true, commitHash: commit }), /did not retain the selected deployment token/);
  assert.equal(notRetained.calls.some(call => call.method === 'POST'), false);
  await assert.rejects(repairPreviewTrigger({ api: mock.api, apply: true, useWorkerToken: true, useMed3dviewerToken: true }), /Select only one/);
});
