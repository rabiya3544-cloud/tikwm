// api/proxy.js
export default async function handler(req, res) {
  // 1. CORS headers – allow any origin and the requested methods
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  // 2. Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. Only process GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET for proxy calls.' });
    return;
  }

  try {
    const { unique_id, endpoint = 'posts', count, cursor, keywords } = req.query;

    if (!unique_id) {
      res.status(400).json({ error: 'unique_id query parameter is required.' });
      return;
    }

    // Map endpoints to their TikWM base paths
    const ENDPOINT_MAP = {
      posts:  'https://tikwm.com/api/user/posts',
      story:  'https://tikwm.com/api/user/story',
      search: 'https://tikwm.com/api/feed/search',
    };

    if (!ENDPOINT_MAP[endpoint]) {
      res.status(400).json({
        error: 'endpoint must be one of: "posts", "story", "search".',
      });
      return;
    }

    // Search requires a keywords parameter
    if (endpoint === 'search' && !keywords) {
      res.status(400).json({ error: 'keywords is required when endpoint=search.' });
      return;
    }

    const encodedId = encodeURIComponent(unique_id);
    const baseUrl = ENDPOINT_MAP[endpoint];
    const params = new URLSearchParams();

    params.append('unique_id', encodedId);
    params.append('count', count || '12');

    // cursor defaults: search & story → 0, posts → empty
    if (cursor !== undefined) {
      params.append('cursor', cursor);
    } else {
      params.append('cursor', endpoint === 'posts' ? '' : '0');
    }

    params.append('web', '1');
    params.append('hd', '1');

    // Only the search endpoint uses keywords
    if (endpoint === 'search') {
      params.append('keywords', keywords);
    }

    const targetUrl = `${baseUrl}?${params.toString()}`;

    // Fetch from TikWM
    const apiResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Vercel-Proxy-Server/1.0',
      },
    });

    if (!apiResponse.ok) {
      throw new Error(`TikWM API responded with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Failed to fetch data from TikWM',
      details: error.message,
    });
  }
}
