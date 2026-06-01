exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const IG_USER_ID    = process.env.IG_USER_ID;
  const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({
      error: 'IG_USER_ID veya IG_ACCESS_TOKEN eksik. Netlify Environment Variables kısmına ekleyin.'
    })};
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { imageUrl, caption } = body;

  if (!imageUrl || !caption) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'imageUrl ve caption gerekli' }) };
  }

  try {
    // Step 1: Create media container
    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${IG_USER_ID}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption,
          access_token: IG_ACCESS_TOKEN,
        }),
      }
    );

    const containerData = await containerRes.json();
    if (!containerRes.ok || !containerData.id) {
      return { statusCode: 502, headers, body: JSON.stringify({
        error: 'Media container oluşturulamadı: ' + JSON.stringify(containerData)
      })};
    }

    const creationId = containerData.id;

    // Step 2: Wait a moment then publish
    await new Promise(r => setTimeout(r, 2000));

    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${IG_USER_ID}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: IG_ACCESS_TOKEN,
        }),
      }
    );

    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({
        error: 'Yayınlama başarısız: ' + JSON.stringify(publishData)
      })};
    }

    return { statusCode: 200, headers, body: JSON.stringify({
      success: true,
      ig_post_id: publishData.id,
      ig_post_url: `https://www.instagram.com/p/${publishData.id}/`
    })};

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
