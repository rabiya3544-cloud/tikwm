// api/proxy.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  try {
    const { unique_id, endpoint = 'posts', count, cursor, keywords, debug } = req.query;

    if (!unique_id) {
      res.status(400).json({ error: 'unique_id query parameter is required.' });
      return;
    }

    const ENDPOINT_MAP = {
      posts:  'https://tikwm.com/api/user/posts',
      story:  'https://tikwm.com/api/user/story',
      search: 'https://tikwm.com/api/feed/search',
    };

    if (!ENDPOINT_MAP[endpoint]) {
      res.status(400).json({ error: 'endpoint must be one of: "posts", "story", "search".' });
      return;
    }

    if (endpoint === 'search' && !keywords) {
      res.status(400).json({ error: 'keywords is required when endpoint=search.' });
      return;
    }

    const baseUrl   = ENDPOINT_MAP[endpoint];
    const params    = new URLSearchParams();

    params.append('unique_id', unique_id);
    params.append('count', count || '12');
    if (cursor !== undefined && cursor !== '') {
      params.append('cursor', cursor);
    } else {
      params.append('cursor', endpoint === 'posts' ? '' : '0');
    }
    params.append('web', '1');
    params.append('hd', '1');
    if (endpoint === 'search') params.append('keywords', keywords);

    const targetUrl = `${baseUrl}?${params.toString()}`;

    // --- Browser-like headers so Cloudflare/TikWM treats us as a real client ---
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://tikwm.com/',
        'Origin': 'https://tikwm.com',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
      },
    });

    const raw         = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';
    const cfMitigated = upstream.headers.get('cf-mitigated');

    // --- Debug mode: return whatever upstream sent so we can see the truth ---
    if (debug) {
      res.status(200).json({
        debug: true,
        targetUrl,
        upstreamStatus: upstream.status,
        contentType,
        cfMitigated,
        bodySnippet: raw.slice(0, 1200),
      });
      return;
    }

    if (!upstream.ok) {
      // HTML usually means a Cloudflare challenge / block page
      if (contentType.includes('text/html')) {
        res.status(502).json({
          error: 'Upstream returned HTML (likely Cloudflare / bot block)',
          status: upstream.status,
          snippet: raw.replace(/\s+/g, ' ').slice(0, 300),
        });
        return;
      }
      res.status(502).json({
        error: `TikWM responded with ${upstream.status}`,
        snippet: raw.replace(/\s+/g, ' ').slice(0, 300),
      });
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      res.status(502).json({
        error: 'Upstream returned non-JSON body',
        contentType,
        snippet: raw.replace(/\s+/g, ' ').slice(0, 300),
      });
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Failed to fetch data from TikWM',
      details: error.message,
    });
  }
}
