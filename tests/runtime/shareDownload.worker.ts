import { createShareWorker, hashToken, SHARE_LIFETIME_MS, type ShareEnvironment, type ShareDatabase } from '../../worker/index';
import { passwordDigest, equalDigest } from '../../worker/workspaceAccess';

const contents = 'solid synthetic\nendsolid synthetic';
const token = 'ab'.repeat(32);
const origin = 'https://viewer.example';
const worker = createShareWorker(); // Use the actual runtime fetch, not a JavaScript fetch mock.
const encoder = new TextEncoder();

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes as ArrayBuffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function environment(redirect = false): Promise<ShareEnvironment> {
  const tokenHash = await hashToken(token);
  const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(0xab), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const source = `https://dl.dropboxusercontent.com/${redirect ? 'redirect' : 'synthetic'}/model.stl?rlkey=synthetic-access`;
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(tokenHash) }, key, encoder.encode(source));
  const created = Date.now();
  const record = {
    token_hash: tokenHash, source_ciphertext: `${hex(iv)}.${hex(ciphertext)}`, model_extension: 'stl',
    model_identity: await hashToken(contents), workspace_json: '{}', owner_ref: 'creator:test',
    created_at: created, expires_at: created + SHARE_LIFETIME_MS, revoked_at: null,
  };
  // SQL/storage semantics are covered by the SQLite-backed Node suite. This
  // read-only fixture isolates the real Workers Request/fetch/stream behavior.
  const database: ShareDatabase = {
    prepare(sql) {
      let values: unknown[] = [];
      return {
        bind(...input) { values = input; return this; },
        async first<T>() {
          let result: unknown;
          if (sql === 'SELECT scope FROM share_environment WHERE id=1') result = { scope: 'test' };
          else if (sql.startsWith('INSERT INTO share_rate_limits')) result = { count: 1 };
          else if (sql.startsWith('SELECT * FROM shares') && values[0] === tokenHash) result = record;
          else throw new Error('Unexpected fixture query');
          return result as T;
        },
        async run() { throw new Error('Unexpected fixture write'); },
      };
    },
    async batch() { throw new Error('Unexpected fixture batch'); },
  };
  return {
    SHARES_DB: database, SHARES_ENABLED: 'true', SHARES_ENVIRONMENT: 'test',
    SHARES_CREATE_KEY: 'synthetic-runtime-test-key-'.repeat(2), SHARES_ENCRYPTION_KEY: 'ab'.repeat(32),
  };
}

async function download(method = 'GET', range?: string, redirect = false): Promise<void> {
  const response = await worker.fetch(new Request(`${origin}/api/shares/${token}/model.stl`, {
    method, headers: range ? { Range: range } : {},
  }), await environment(redirect));
  const body = new TextDecoder().decode(await response.arrayBuffer());
  check(response.status === (range ? 206 : 200), `Model download returned ${response.status}: ${body}`);
  check(response.headers.get('Cache-Control') === 'no-store, max-age=0', 'Recipient response must not be cached');
  check(response.headers.get('Set-Cookie') === null && response.headers.get('Location') === null, 'Source details leaked');
  check(body === (method === 'HEAD' ? '' : range ? contents.slice(0, 5) : contents), 'Model bytes changed');
  if (range) check(response.headers.get('Content-Range') === `bytes 0-4/${contents.length}`, 'Range metadata changed');
}

export const get = { async test() { await download(); } };
export const head = { async test() { await download('HEAD'); } };
export const range = { async test() { await download('GET', 'bytes=0-4'); } };
export const redirect = { async test() { await download('GET', undefined, true); } };
export const password = { async test() {
  const digest=await passwordDigest('synthetic-workspace-password','synthetic-salt','synthetic-pepper');
  check(equalDigest(digest,await passwordDigest('synthetic-workspace-password','synthetic-salt','synthetic-pepper')),'Password verification failed');
  check(!equalDigest(digest,await passwordDigest('wrong-workspace-password','synthetic-salt','synthetic-pepper')),'Wrong password accepted');
} };
