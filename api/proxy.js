export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Use GET' }); return; }

  const { unique_id, endpoint = 'posts', count, cursor, keywords } = req.query;
  if (!unique_id) { res.status(400).json({ error: 'unique_id required' }); return; }

  const MAP = {
    posts:  'https://tikwm.com/api/user/posts',
    story:  'https://tikwm.com/api/user/story',
    search: 'https://tikwm.com/api/feed/search',
  };
  const base = MAP[endpoint];
  if (!base) { res.status(400).json({ error: 'invalid endpoint' }); return; }

  const params = new URLSearchParams({
    unique_id,
    count: count || '12',
    cursor: cursor ?? (endpoint === 'posts' ? '' : '0'),
    web: '1', hd: '1',
    ...(endpoint === 'search' && { keywords }),
  });

  const target = `${base}?${params}`;
  const url = `https://api.scraperapi.com/?api_key=${process.env.SCRAPER_KEY}&url=${encodeURIComponent(target)}`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    res.setHeader('content-type', 'application/json');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
