import type { ShareDatabase } from './index';

export interface CleanupEnvironment {
  SHARES_DB?: ShareDatabase;
  SHARES_ENVIRONMENT?: string;
}

// The immutable database marker prevents a copied binding/config from touching
// another environment, including from a separately deployed beta cleanup job.
export async function databaseScopeMatches(env: CleanupEnvironment): Promise<boolean> {
  if (!env.SHARES_DB || !['test','beta','main','box-test'].includes(env.SHARES_ENVIRONMENT || '')) return false;
  try {
    const row = await env.SHARES_DB.prepare('SELECT scope FROM share_environment WHERE id=1').first<{ scope: string }>();
    return row?.scope === env.SHARES_ENVIRONMENT;
  } catch { return false; }
}

export async function cleanupExpiredShares(env: CleanupEnvironment, timestamp = Date.now()): Promise<void> {
  if (!await databaseScopeMatches(env)) return;
  for (let batch = 0; batch < 10; batch++) {
    const result = await env.SHARES_DB!.prepare('DELETE FROM shares WHERE token_hash IN (SELECT token_hash FROM shares WHERE expires_at<=? OR revoked_at IS NOT NULL LIMIT 100)').bind(timestamp).run();
    if ((result.meta?.changes || 0) < 100) break;
  }
  for(let batch=0;batch<10;batch++) {
    const result=await env.SHARES_DB!.prepare(`DELETE FROM shares WHERE token_hash IN (
      SELECT child.token_hash FROM shares child WHERE child.owner_ref LIKE 'model-from:%'
      AND NOT EXISTS(SELECT 1 FROM shares parent WHERE parent.token_hash=substr(child.owner_ref,12,64) AND parent.expires_at>? AND parent.revoked_at IS NULL) LIMIT 100)`).bind(timestamp).run();
    if((result.meta?.changes||0)<100)break;
  }
  await env.SHARES_DB!.prepare('DELETE FROM share_rate_limits WHERE bucket IN (SELECT bucket FROM share_rate_limits WHERE expires_at<=? LIMIT 1000)').bind(timestamp).run();

}

export default {
  // No HTTP cleanup route or privileged secret; scheduled execution only.
  fetch(): Response { return new Response('Not found', { status:404,headers:{ 'Cache-Control':'no-store' } }); },
  async scheduled(_controller: unknown, env: CleanupEnvironment): Promise<void> { await cleanupExpiredShares(env); },
};
