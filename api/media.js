// api/media.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { path } = req.query;
  if (!path || !path.startsWith('/video/')) {
    res.status(400).json({ error: 'path required and must start with /video/' });
    return;
  }

  const target = `https://tikwm.com${path}`;
  const url = `https://api.scraperapi.com/?api_key=${process.env.SCRAPER_KEY}&url=${encodeURIComponent(target)}`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
      return;
    }

    // Cache at Vercel edge: 1 day browser, 7 days CDN. Prevents credit burn.
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/octet-stream'
    );

    // Stream the body — avoids buffering large videos in memory
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
