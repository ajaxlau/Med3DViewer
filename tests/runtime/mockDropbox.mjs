const contents = 'solid synthetic\nendsolid synthetic';
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.has('Cookie') || request.headers.has('Authorization')) throw new Error('Credentials must not reach Dropbox');
    if (request.cf?.cacheTtl !== -1 || request.cf?.cacheLevel !== 'bypass' || request.headers.get('Pragma') !== 'no-cache') {
      throw new Error('Runtime did not apply no-store cache bypass semantics');
    }
    if (url.hostname === 'dl.dropboxusercontent.com' && url.pathname === '/redirect/model.stl') {
      return new Response(null, { status: 302, headers: { Location: 'https://www.dropbox.com/s/dl/synthetic/model.stl?rlkey=synthetic-access' } });
    }
    const direct = url.hostname === 'dl.dropboxusercontent.com' && url.pathname === '/synthetic/model.stl';
    const redirected = url.hostname === 'www.dropbox.com' && url.pathname === '/s/dl/synthetic/model.stl';
    if ((!direct && !redirected) || url.searchParams.get('rlkey') !== 'synthetic-access') throw new Error('Unexpected source request');
    const range = request.headers.get('Range');
    if (range && range !== 'bytes=0-4') throw new Error('Unexpected Range');
    const body = range ? contents.slice(0, 5) : contents;
    return new Response(request.method === 'HEAD' ? null : body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length),
        'Set-Cookie': 'synthetic-source-cookie=private',
        ...(range ? { 'Content-Range': `bytes 0-4/${contents.length}` } : {}),
      },
    });
  },
};
