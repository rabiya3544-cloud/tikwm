// worker.js — deploy this on Cloudflare Workers
export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
        },
      });
    }

    const url = new URL(request.url);
    const unique_id = url.searchParams.get('unique_id');
    const endpoint = url.searchParams.get('endpoint') || 'posts';

    if (!unique_id) {
      return new Response(JSON.stringify({ error: 'unique_id required' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const ENDPOINT_MAP = {
      posts:  'https://tikwm.com/api/user/posts',
      story:  'https://tikwm.com/api/user/story',
      search: 'https://tikwm.com/api/feed/search',
    };

    const base = ENDPOINT_MAP[endpoint];
    if (!base) {
      return new Response(JSON.stringify({ error: 'invalid endpoint' }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const params = new URLSearchParams();
    params.set('unique_id', decodeURIComponent(unique_id)); // avoid double-encode
    params.set('count', url.searchParams.get('count') || '12');
    params.set('cursor', url.searchParams.get('cursor') ?? (endpoint === 'posts' ? '' : '0'));
    params.set('web', '1');
    params.set('hd', '1');
    if (endpoint === 'search') params.set('keywords', url.searchParams.get('keywords') || '');

    const target = `${base}?${params}`;

    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://tikwm.com/',
      },
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
