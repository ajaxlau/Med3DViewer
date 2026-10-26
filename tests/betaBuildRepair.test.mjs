import assert from 'node:assert/strict';
import test from 'node:test';
import { repairBeta, validateBeta, apiClient, REFERENCE_BUILD, TOKEN, BUILD_COMMAND, PREVIEW_COMMAND } from '../scripts/repair-beta-build.mjs';

const tag = 'a'.repeat(32), id = '11111111-1111-1111-1111-111111111111', sha = 'b'.repeat(40);
const trigger = () => ({ external_script_id: tag, trigger_uuid: id, branch_includes: ['beta'], branch_excludes: [],
  repo_connection: { provider_account_name: 'ajaxlau', repo_name: 'Med3DViewer' }, root_directory: '/',
  build_command: 'npm run build', deploy_command: 'npx wrangler preview', build_token_uuid: 'old-token-reference' });
function fake({ initial = trigger(), variables = {}, retain = true, tokenName = 'med3dviewer build token' } = {}) {
  let stored = structuredClone(initial);
  const calls = [];
  return { calls, api: async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === `/builds/builds/${REFERENCE_BUILD}`) return {
      build_trigger_metadata: { branch: 'beta', provider_account_name: 'ajaxlau', repo_name: 'Med3DViewer' },
      trigger: { external_script_id: tag, trigger_uuid: id },
    };
    if (path.endsWith('/environment_variables')) return variables;
    if (path === '/builds/tokens?per_page=200') return [{ build_token_uuid: TOKEN, build_token_name: tokenName, owner_type: 'user' }];
    if (method === 'GET' && path.endsWith('/triggers')) return [structuredClone(stored)];
    if (method === 'PATCH') { if (retain) stored = { ...stored, ...body }; return stored; }
    if (method === 'POST') return { build_uuid: '22222222-2222-2222-2222-222222222222' };
    throw new Error('Unexpected API call.');
  }};
}
test('production, wildcard, feature, and mixed branch triggers cannot be modified', async () => {
  for (const branches of [['main'], ['*'], ['feature'], ['beta', 'main']]) {
    const mock = fake({ initial: { ...trigger(), branch_includes: branches } });
    await assert.rejects(repairBeta({ api: mock.api, apply: true }));
    assert(mock.calls.every(c => c.method === 'GET'));
  }
});
test('wrong Worker, repository, root, deleted trigger, and production command are rejected', () => {
  for (const bad of [
    { external_script_id: 'c'.repeat(32) }, { repo_connection: { provider_account_name: 'other', repo_name: 'Med3DViewer' } },
    { root_directory: '/other' }, { deleted_on: 'today' }, { deploy_command: 'npx wrangler deploy' },
  ]) assert.throws(() => validateBeta({ ...trigger(), ...bad }, tag));
});
test('default inspection performs only reads and never prints variable values', async () => {
  const mock = fake({ variables: { SOME_SECRET: { value: 'must-never-print', is_secret: false } } });
  const reports = [];
  await repairBeta({ api: mock.api, report: v => reports.push(v) });
  assert(mock.calls.every(c => c.method === 'GET'));
  assert(!JSON.stringify(reports).includes('must-never-print'));
});
test('apply patches only beta commands/token and verifies before starting its exact commit', async () => {
  const mock = fake();
  await repairBeta({ api: mock.api, apply: true, startBuild: true, commitSha: sha });
  assert.deepEqual(mock.calls.filter(c => c.method === 'PATCH'), [{ method: 'PATCH', path: `/builds/triggers/${id}`,
    body: { build_token_uuid: TOKEN, build_command: BUILD_COMMAND, deploy_command: PREVIEW_COMMAND } }]);
  assert.deepEqual(mock.calls.filter(c => c.method === 'POST'), [{ method: 'POST', path: `/builds/triggers/${id}/builds`, body: { branch: 'beta', commit_hash: sha } }]);
});
test('already-correct beta settings are idempotent', async () => {
  const mock = fake({ initial: { ...trigger(), build_token_uuid: TOKEN, build_command: BUILD_COMMAND, deploy_command: PREVIEW_COMMAND } });
  const result = await repairBeta({ api: mock.api, apply: true });
  assert.equal(result.changed, false);
  assert(mock.calls.every(c => c.method === 'GET'));
});
test('missing token, environment override and failed readback prevent uploads', async () => {
  for (const options of [{ tokenName: 'another app' }, { variables: { CLOUDFLARE_API_TOKEN: { value: 'never-print' } } }, { retain: false }]) {
    const mock = fake(options);
    await assert.rejects(repairBeta({ api: mock.api, apply: true, startBuild: true, commitSha: sha }));
    assert(!mock.calls.some(c => c.method === 'POST'));
  }
});
test('an upload requires apply and a full commit SHA', async () => {
  for (const args of [{ startBuild: true, commitSha: sha }, { apply: true, startBuild: true, commitSha: 'short' }]) {
    const mock = fake();
    await assert.rejects(repairBeta({ api: mock.api, ...args }));
    assert.equal(mock.calls.length, 0);
  }
});
test('missing credentials fail before requests and API errors redact the credential', async () => {
  assert.throws(() => apiClient(''), /Restore the CF_BUILDS_REPAIR_TOKEN/);
  const token = 'test-secret-value';
  const api = apiClient(token, async () => ({ ok: false, status: 403,
    json: async () => ({ success: false, errors: [{ message: token }] }) }));
  await assert.rejects(api('GET', '/builds/tokens'), e => !e.message.includes(token) && e.message.includes('[REDACTED]'));
});
