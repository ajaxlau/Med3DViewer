import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const ACCOUNT = '9653dc93bd5d739089edd92b89aded14';
export const REFERENCE_BUILD = '983045cb-3d69-4599-bcd2-f2ec7a9b882b';
export const TOKEN = 'ade69c15-04e0-42d6-94ad-77f510510155';
export const BUILD_COMMAND = 'npm run build:cloudflare';
export const PREVIEW_COMMAND = 'npx wrangler preview --config ./wrangler.jsonc';
// Exact mobile-pasted command observed through authenticated beta inspection.
export const MALFORMED_PREVIEW_COMMAND = 'npx wrangler preview —config ./wrangler.jsonc';

export function validateBeta(trigger, tag) {
  assert(trigger && !trigger.deleted_on, 'Missing/deleted beta trigger.');
  assert.equal(trigger.external_script_id, tag, 'Worker mismatch.');
  assert.equal(trigger.repo_connection?.provider_account_name, 'ajaxlau');
  assert(['Med3DViewer', 'ajaxlau/Med3DViewer'].includes(trigger.repo_connection?.repo_name));
  assert.deepEqual(trigger.branch_includes, ['beta'], 'Only an exact beta trigger can be changed.');
  assert(Array.isArray(trigger.branch_excludes) && trigger.branch_excludes.every(b => b === 'main'));
  assert(['/', '.', ''].includes(trigger.root_directory));
  assert(['npm run build', BUILD_COMMAND].includes(trigger.build_command), 'Unexpected build command.');
  assert(['npx wrangler preview', PREVIEW_COMMAND, MALFORMED_PREVIEW_COMMAND].includes(trigger.deploy_command), 'Unexpected preview command.');
  assert(/^[a-f0-9-]{36}$/i.test(trigger.trigger_uuid));
}

export async function repairBeta({ api, apply = false, startBuild = false, commitSha, report = () => {} }) {
  assert(!startBuild || (apply && /^[a-f0-9]{40}$/i.test(commitSha ?? '')), 'Building requires apply and an exact commit.');
  const reference = await api('GET', `/builds/builds/${REFERENCE_BUILD}`);
  const metadata = reference.build_trigger_metadata;
  assert.equal(metadata?.branch, 'beta');
  assert.equal(metadata.provider_account_name, 'ajaxlau');
  assert(['Med3DViewer', 'ajaxlau/Med3DViewer'].includes(metadata.repo_name));
  const tag = reference.trigger?.external_script_id;
  assert(/^[a-f0-9-]{32,36}$/i.test(tag ?? ''), 'Missing Worker identity.');
  const describe = t => ({ trigger_uuid: t?.trigger_uuid, worker_tag: t?.external_script_id,
    branch_includes: t?.branch_includes, branch_excludes: t?.branch_excludes,
    repository: t?.repo_connection?.repo_name, owner: t?.repo_connection?.provider_account_name,
    root_directory: t?.root_directory, build_command: t?.build_command,
    deploy_command: t?.deploy_command, build_token_uuid: t?.build_token_uuid,
    deleted: Boolean(t?.deleted_on) });
  report({ reference_beta_trigger: describe(reference.trigger) });
  const listPath = `/builds/workers/${encodeURIComponent(tag)}/triggers`;
  const select = async () => {
    const triggers = await api('GET', listPath);
    assert(Array.isArray(triggers));
    const matches = triggers.filter(t => {
      try { validateBeta(t, tag); return true; } catch (error) {
        report({ unmatched_trigger: describe(t), validation_error: error.message });
        return false;
      }
    });
    assert.equal(matches.length, 1, 'Expected exactly one beta-only trigger.');
    return matches[0];
  };
  const selected = await select();
  assert.equal(selected.trigger_uuid, reference.trigger.trigger_uuid, 'Reference trigger mismatch.');
  const snapshot = t => ({ trigger_uuid: t.trigger_uuid, branch: 'beta', build_command: t.build_command,
    deploy_command: t.deploy_command, build_token_uuid: t.build_token_uuid });
  report({ stored_beta: snapshot(selected) });
  const variables = await api('GET', `/builds/triggers/${selected.trigger_uuid}/environment_variables`);
  assert(variables && typeof variables === 'object' && !Array.isArray(variables));
  assert(!Object.hasOwn(variables, 'CLOUDFLARE_API_TOKEN'), 'A build-variable credential override requires separate inspection. No settings changed.');
  const tokens = await api('GET', '/builds/tokens?per_page=200');
  assert(Array.isArray(tokens));
  const token = tokens.find(t => t.build_token_uuid === TOKEN);
  assert.equal(token?.build_token_name, 'med3dviewer build token', 'Owner-selected token is not registered.');
  assert.equal(token.owner_type, 'user');
  if (!apply) return { inspectionOnly: true };
  const current = await select();
  assert.deepEqual(snapshot(current), snapshot(selected), 'Beta settings changed during inspection.');
  const patch = {};
  if (current.build_token_uuid !== TOKEN) patch.build_token_uuid = TOKEN;
  if (current.build_command !== BUILD_COMMAND) patch.build_command = BUILD_COMMAND;
  if (current.deploy_command !== PREVIEW_COMMAND) patch.deploy_command = PREVIEW_COMMAND;
  if (Object.keys(patch).length) await api('PATCH', `/builds/triggers/${current.trigger_uuid}`, patch);
  const verified = await select();
  assert.equal(verified.trigger_uuid, current.trigger_uuid);
  assert.equal(verified.build_token_uuid, TOKEN, 'Token readback failed.');
  assert.equal(verified.build_command, BUILD_COMMAND);
  assert.equal(verified.deploy_command, PREVIEW_COMMAND);
  report({ verified_beta: snapshot(verified), changed: Object.keys(patch).length > 0 });
  if (!startBuild) return { changed: Object.keys(patch).length > 0 };
  const build = await api('POST', `/builds/triggers/${current.trigger_uuid}/builds`, { branch: 'beta', commit_hash: commitSha });
  assert(/^[a-f0-9-]{36}$/i.test(build.build_uuid ?? ''));
  report({ started_build: build.build_uuid, branch: 'beta', commit: commitSha });
  return { buildUuid: build.build_uuid };
}

export function apiClient(token, fetcher = fetch) {
  assert(token, 'Restore the CF_BUILDS_REPAIR_TOKEN repository Actions secret, then rerun this job. Never paste the token into chat.');
  return async (method, path, body) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert(response.ok && data.success === true,
      `Cloudflare ${method} ${path} failed (${response.status}): ${JSON.stringify(data.errors ?? []).split(token).join('[REDACTED]')}`);
    return data.result;
  };
}

async function monitor(api, id, report) {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const build = await api('GET', `/builds/builds/${id}`);
    if (build.status === 'stopped') {
      const urls = new Set();
      let cursor = '';
      for (let page = 0; page < 20; page++) {
        const log = await api('GET', `/builds/builds/${id}/logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        for (const entry of log.lines ?? []) {
          const line = Array.isArray(entry) ? entry.find(p => typeof p === 'string') : typeof entry === 'string' ? entry : entry?.line;
          if (typeof line !== 'string') continue;
          for (const match of line.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi)) urls.add(match[0]);
          if (/\[ERROR\]|Authentication error|Invalid access token|Executing user.*command/.test(line)) report({ build_log: line });
        }
        if (!log.truncated || !log.cursor || cursor === log.cursor) break;
        cursor = log.cursor;
      }
      report({ build_uuid: id, outcome: build.build_outcome, preview_urls: [...urls] });
      assert.equal(build.build_outcome, 'success', 'Beta upload failed. Inspect the reported build.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Build ${id} is still running; inspect before retrying.`);
}

async function main() {
  const flags = process.argv.slice(2);
  assert(flags.every(f => ['--apply', '--start-build'].includes(f)), 'Unknown option.');
  assert.equal(process.env.GITHUB_REF_NAME ?? 'beta', 'beta');
  const token = process.env.CF_BUILDS_REPAIR_TOKEN;
  const api = apiClient(token);
  const report = value => console.log(JSON.stringify(value).split(token).join('[REDACTED]'));
  const result = await repairBeta({ api, apply: flags.includes('--apply'), startBuild: flags.includes('--start-build'), commitSha: process.env.GITHUB_SHA, report });
  if (result.buildUuid) await monitor(api, result.buildUuid, report);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(String(error.message).split(process.env.CF_BUILDS_REPAIR_TOKEN || '\0').join('[REDACTED]'));
    process.exitCode = 1;
  });
}
