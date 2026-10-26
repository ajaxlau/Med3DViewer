import { pathToFileURL } from 'node:url';

// One-time repair for the Worker/build positively identified in the deployment logs.
export const ACCOUNT_ID = '9653dc93bd5d739089edd92b89aded14';
export const FAILED_BUILD_ID = 'ec406b64-233e-41e8-b1a4-34c206558c32';
export const PREVIEW_BRANCH = 'codex/review-beta-branch-for-conflicts-and-bugs';
export const BAD_COMMAND = 'npx wrangler preview:cloudflare';
export const PREVIEW_COMMAND = 'npx wrangler preview --config ./wrangler.jsonc';
export const INVALID_DEPLOY_TOKEN_UUID = '36a345a3-fcc8-4541-b787-9fb209923de9';
export const WORKER_DEPLOY_TOKEN_UUID = '0ab162f0-f44c-4068-85ce-358437d49fc8';
const BUILD_COMMAND = 'npm run build:cloudflare';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRepo(owner, name) {
  return owner === 'ajaxlau' && ['Med3DViewer', 'ajaxlau/Med3DViewer'].includes(name);
}

export function assertPreviewTrigger(trigger, workerTag) {
  assert(trigger && !trigger.deleted_on, 'Trigger is missing or deleted.');
  assert(trigger.external_script_id === workerTag, 'Worker tag mismatch.');
  assert(isRepo(trigger.repo_connection?.provider_account_name, trigger.repo_connection?.repo_name), 'Repository mismatch or missing repository identity.');
  const includes = trigger.branch_includes;
  const excludes = trigger.branch_excludes;
  const allPreviews = includes?.length === 1 && includes[0] === '*'
    && excludes?.length === 1 && excludes[0] === 'main';
  // The API exposed a dedicated trigger for this exact feature branch. It also
  // cannot match main, even though it does not need an explicit main exclusion.
  const exactPreview = includes?.length === 1 && includes[0] === PREVIEW_BRANCH
    && Array.isArray(excludes) && excludes.length <= 1
    && excludes.every(branch => branch === 'main');
  assert(allPreviews || exactPreview, 'Refusing production-capable or unexpected branch filters.');
  assert(trigger.build_command === BUILD_COMMAND, 'Unexpected build command.');
  assert(['/', '', '.'].includes(trigger.root_directory), 'Unexpected repository root.');
  assert([BAD_COMMAND, PREVIEW_COMMAND].includes(trigger.deploy_command), 'Unexpected deployment command; refusing to replace it.');
  assert(typeof trigger.trigger_uuid === 'string' && /^[\da-f-]{36}$/i.test(trigger.trigger_uuid), 'Missing or invalid trigger UUID.');
}

function summary(trigger) {
  return {
    trigger_uuid: trigger.trigger_uuid,
    trigger_name: trigger.trigger_name,
    branch_includes: trigger.branch_includes,
    branch_excludes: trigger.branch_excludes,
    build_command: trigger.build_command,
    deploy_command: trigger.deploy_command,
    root_directory: trigger.root_directory,
    build_token_uuid: trigger.build_token_uuid,
    deleted: Boolean(trigger.deleted_on),
  };
}

export async function repairPreviewTrigger({ api, apply = false, startBuild = false, useWorkerToken = false, commitHash, branch = PREVIEW_BRANCH, report = () => {} }) {
  assert(branch === PREVIEW_BRANCH, 'Only the PR #10 feature branch may be built.');
  assert(!startBuild || (apply && /^[\da-f]{40}$/i.test(commitHash ?? '')), 'Starting a build requires --apply and a full commit SHA.');
  const build = await api('GET', `/builds/builds/${FAILED_BUILD_ID}`);
  const metadata = build.build_trigger_metadata;
  assert(metadata?.branch === PREVIEW_BRANCH, 'The reference build does not belong to the expected feature branch.');
  assert(isRepo(metadata.provider_account_name, metadata.repo_name), 'Reference build repository mismatch.');
  const workerTag = build.trigger?.external_script_id;
  assert(typeof workerTag === 'string' && /^[\da-f-]{32,36}$/i.test(workerTag), 'Reference build does not identify its Worker tag.');
  report({ reference_build: FAILED_BUILD_ID, branch: metadata.branch, commit: metadata.commit_hash, recorded_command: metadata.deploy_command, recorded_trigger: build.trigger?.trigger_uuid });

  const listPath = `/builds/workers/${encodeURIComponent(workerTag)}/triggers`;
  const list = await api('GET', listPath);
  assert(Array.isArray(list), 'Unexpected trigger-list response.');
  for (const trigger of list) report({ stored_trigger: summary(trigger) });
  const candidates = list.filter(trigger => {
    try { assertPreviewTrigger(trigger, workerTag); return true; } catch { return false; }
  });
  assert(candidates.length === 1, 'Expected exactly one matching preview trigger. No configuration was changed; inspect the printed trigger summaries.');
  const selected = candidates[0];
  report({ proposed_patch: { trigger_uuid: selected.trigger_uuid, deploy_command: PREVIEW_COMMAND }, apply });
  if (!apply) return { triggerUuid: selected.trigger_uuid, changed: false, inspectionOnly: true };

  // Re-read and validate immediately before writing; never patch production or filters.
  const current = (await api('GET', listPath)).find(t => t.trigger_uuid === selected.trigger_uuid);
  assertPreviewTrigger(current, workerTag);
  assert(current.deploy_command === selected.deploy_command, 'Trigger changed during inspection; retry inspection first.');
  const patch = {};
  if (current.deploy_command === BAD_COMMAND) patch.deploy_command = PREVIEW_COMMAND;
  if (useWorkerToken) {
    const tokens = await api('GET', '/builds/tokens?per_page=200');
    assert(Array.isArray(tokens), 'Unexpected build-token list response.');
    const replacement = tokens.find(token => token.build_token_uuid === WORKER_DEPLOY_TOKEN_UUID);
    assert(replacement?.build_token_name === 'ntec3dpo-m3dv build token' && replacement.owner_type === 'user', 'The expected Worker-specific deployment token is not registered.');
    assert(current.build_token_uuid === selected.build_token_uuid, 'The deployment token changed during inspection.');
    assert([INVALID_DEPLOY_TOKEN_UUID, WORKER_DEPLOY_TOKEN_UUID].includes(current.build_token_uuid), 'Unexpected deployment-token binding; refusing to replace it.');
    if (current.build_token_uuid !== WORKER_DEPLOY_TOKEN_UUID) patch.build_token_uuid = WORKER_DEPLOY_TOKEN_UUID;
  }
  const changed = Object.keys(patch).length > 0;
  if (changed) {
    report({ exact_patch: patch, trigger_uuid: current.trigger_uuid });
    await api('PATCH', `/builds/triggers/${current.trigger_uuid}`, patch);
  }
  const verified = (await api('GET', listPath)).find(t => t.trigger_uuid === selected.trigger_uuid);
  assertPreviewTrigger(verified, workerTag);
  assert(verified.deploy_command === PREVIEW_COMMAND, 'The API did not retain the corrected preview command.');
  if (useWorkerToken) assert(verified.build_token_uuid === WORKER_DEPLOY_TOKEN_UUID, 'The API did not retain the Worker-specific deployment token.');
  report({ verified_trigger: summary(verified), changed });

  if (!startBuild) return { triggerUuid: selected.trigger_uuid, changed };
  const started = await api('POST', `/builds/triggers/${selected.trigger_uuid}/builds`, { branch, commit_hash: commitHash });
  assert(typeof started.build_uuid === 'string' && /^[\da-f-]{36}$/i.test(started.build_uuid), 'Build started without a recognizable build UUID.');
  report({ started_build: started.build_uuid, branch, commit: commitHash });
  return { triggerUuid: selected.trigger_uuid, changed, buildUuid: started.build_uuid };
}

export function cloudflareApi(token, fetcher = fetch) {
  assert(token, 'Add the CF_BUILDS_REPAIR_TOKEN repository Actions secret, then rerun this job.');
  return async (method, resource, body) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${resource}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) {
      const message = (result.errors ?? []).map(e => `${e.code ?? ''} ${e.message ?? ''}`).join('; ');
      throw new Error(`Cloudflare ${method} ${resource} failed (${response.status}): ${message.split(token).join('[REDACTED]')}`);
    }
    return result.result;
  };
}

export function buildLogLines(logs) {
  return (logs.lines ?? []).flatMap(entry => {
    // Builds API log entries are [epoch timestamp, message] tuples.
    if (Array.isArray(entry)) return entry.filter(part => typeof part === 'string');
    if (typeof entry === 'string') return [entry];
    const text = entry?.line ?? entry?.message ?? entry?.text;
    return typeof text === 'string' ? [text] : [];
  });
}

export async function inspectDeploymentTokens(api, report) {
  await repairPreviewTrigger({ api, report });
  const tokens = await api('GET', '/builds/tokens?per_page=200');
  assert(Array.isArray(tokens), 'Unexpected build-token list response.');
  for (const token of tokens) {
    report({ deployment_token: {
      build_token_uuid: token.build_token_uuid,
      build_token_name: token.build_token_name,
      owner_type: token.owner_type,
    } });
  }
}

async function waitForBuild(api, buildUuid, report) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const build = await api('GET', `/builds/builds/${buildUuid}`);
    if (build.status === 'stopped') {
      report({ build_uuid: buildUuid, outcome: build.build_outcome, preview_url: build.preview_url, executed_command: build.build_trigger_metadata?.deploy_command });
      if (build.build_outcome !== 'success') {
        const lines = [];
        let cursor = '';
        for (let page = 0; page < 20; page++) {
          const logs = await api('GET', `/builds/builds/${buildUuid}/logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
          lines.push(...buildLogLines(logs));
          if (!logs.truncated || !logs.cursor || logs.cursor === cursor) break;
          cursor = logs.cursor;
        }
        const selected = new Set();
        lines.forEach((line, index) => {
          if (/Executing user|\[ERROR\]|Authentication|Invalid access|Missing |Unknown argument|Error:/i.test(line)) {
            for (let i = index; i <= Math.min(index + 8, lines.length - 1); i++) selected.add(i);
          }
        });
        for (const index of [...selected].sort((a, b) => a - b).slice(0, 100)) {
          report({ build_log: lines[index] });
        }
        throw new Error(`Preview build ${buildUuid} finished with outcome ${build.build_outcome}.`);
      }
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw new Error(`Preview build ${buildUuid} is still running; inspect its status before retrying.`);
}

async function main() {
  const token = process.env.CF_BUILDS_REPAIR_TOKEN;
  const api = cloudflareApi(token);
  // Only allow known options; inspecting is the default when run locally.
  const flags = new Set(process.argv.slice(2));
  assert([...flags].every(f => ['--apply', '--start-build', '--wait', '--inspect-tokens', '--use-worker-token'].includes(f)), 'Unknown command option.');
  assert(!flags.has('--wait') || flags.has('--start-build'), '--wait requires --start-build.');
  assert(!flags.has('--use-worker-token') || flags.has('--apply'), '--use-worker-token requires --apply.');
  const report = value => console.log(JSON.stringify(value).split(token).join('[REDACTED]'));
  if (flags.has('--inspect-tokens')) {
    assert(flags.size === 1, '--inspect-tokens is read-only and cannot be combined with write options.');
    await inspectDeploymentTokens(api, report);
    return;
  }
  const result = await repairPreviewTrigger({
    api,
    apply: flags.has('--apply'),
    startBuild: flags.has('--start-build'),
    useWorkerToken: flags.has('--use-worker-token'),
    branch: process.env.GITHUB_REF_NAME ?? PREVIEW_BRANCH,
    commitHash: process.env.GITHUB_SHA,
    report,
  });
  if (flags.has('--wait') && result.buildUuid) await waitForBuild(api, result.buildUuid, report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const token = process.env.CF_BUILDS_REPAIR_TOKEN;
    console.error(token ? error.message.split(token).join('[REDACTED]') : error.message);
    process.exitCode = 1;
  });
}
