// worker.js — Cloudflare Worker
import { request } from 'stealth-fetch/web';

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE' },
      });
    }
    const url = new URL(req.url);
    const unique_id = url.searchParams.get('unique_id');
    const endpoint = url.searchParams.get('endpoint') || 'posts';
    const base = {
      posts: 'https://tikwm.com/api/user/posts',
      story: 'https://tikwm.com/api/user/story',
      search: 'https://tikwm.com/api/feed/search',
    }[endpoint];
    const params = new URLSearchParams({
      unique_id,
      count: url.searchParams.get('count') || '12',
      cursor: url.searchParams.get('cursor') ?? (endpoint === 'posts' ? '' : '0'),
      web: '1', hd: '1',
      ...(endpoint === 'search' && { keywords: url.searchParams.get('keywords') }),
    });
    const up = await request(`${base}?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://tikwm.com/' },
    });
    return new Response(await up.text(), {
      status: up.status,
      headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  },
};
