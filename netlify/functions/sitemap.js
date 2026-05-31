const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const siteUrl = process.env.URL || 'https://miniaturebottles5cl.netlify.app';
  const today = new Date().toISOString().split('T')[0];

  let bottles = [], cocktails = [];
  try {
    const [bd, cd] = await Promise.all([
      fetchJson(`${siteUrl}/data/bottles.json`),
      fetchJson(`${siteUrl}/data/cocktails.json`),
    ]);
    bottles = (bd.items || bd).filter(b => b.active !== false && b.status !== 'draft');
    cocktails = (cd.items || cd).filter(c => c.active !== false);
  } catch(e) {
    console.error('Data fetch error:', e.message);
  }

  const urls = [
    // Main pages
    { loc: siteUrl, priority: '1.0', changefreq: 'weekly' },
    { loc: `${siteUrl}/#cocktails`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${siteUrl}/#extras`, priority: '0.7', changefreq: 'weekly' },
    // Bottle detail pages
    ...bottles.map(b => ({
      loc: `${siteUrl}/#bottle/${b.slug}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: today,
    })),
    // Cocktail detail pages
    ...cocktails.map(c => ({
      loc: `${siteUrl}/#cocktail/${c.id}`,
      priority: '0.5',
      changefreq: 'monthly',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
    body: xml,
  };
};
