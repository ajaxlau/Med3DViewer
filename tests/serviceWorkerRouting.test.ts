import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationFallbackDenylist } from '../src/lib/serviceWorkerPolicy';

// Use Workbox's real navigation matcher, with the navigation-only request mode
// that Node's Request constructor cannot create outside a browser.
Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true });
(globalThis as any).__WB_DISABLE_DEV_LOGS = true;
const { NavigationRoute } = await import('workbox-routing/NavigationRoute.js');
const shell = async () => new Response('app shell');
function matches(route: InstanceType<typeof NavigationRoute>, path: string, mode = 'navigate') {
  return (route.match as any)({ url: new URL(path, 'https://viewer.example'), request: { mode } });
}

test('default navigation fallback reproduces the API-address app-shell interception', () => {
  assert.equal(matches(new NavigationRoute(shell), '/api/shares/config'), true);
});
test('API pages and model addresses bypass the offline app shell', () => {
  const route = new NavigationRoute(shell, { denylist: navigationFallbackDenylist });
  for (const path of ['/api', '/api?check=1', '/api/shares', '/api/shares/config', '/api/shares/config?check=1', `/api/shares/${'a'.repeat(64)}/model.stl`]) {
    assert.equal(matches(route, path), false, path);
  }
});
test('viewer and shared-workspace pages retain offline navigation fallback', () => {
  const route = new NavigationRoute(shell, { denylist: navigationFallbackDenylist });
  for (const path of ['/', `/s/${'a'.repeat(64)}`, '/apiary', '/help?next=/api']) assert.equal(matches(route, path), true, path);
  assert.equal(matches(route, '/api/shares/config', 'cors'), false);
});
