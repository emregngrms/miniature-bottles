exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const IG_USER_ID     = process.env.IG_USER_ID;
  const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({
      error: 'IG_USER_ID veya IG_ACCESS_TOKEN eksik.'
    })};
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // imageUrl = single image, imageUrls = array for carousel
  const { imageUrl, imageUrls, caption } = body;
  const images = imageUrls && imageUrls.length > 0 ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!images.length || !caption) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'imageUrl ve caption gerekli' }) };
  }

  const apiBase = `https://graph.instagram.com/v21.0/${IG_USER_ID}`;

  try {
    let creationId;

    if (images.length === 1) {
      // Single image post
      const res = await fetch(`${apiBase}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: images[0],
          caption,
          access_token: IG_ACCESS_TOKEN,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Container hatası: ' + JSON.stringify(data) }) };
      }
      creationId = data.id;

    } else {
      // Carousel post (2-10 images)
      // Step 1: Create a container for each image
      const containerIds = [];
      for (const imgUrl of images.slice(0, 10)) { // max 10
        const res = await fetch(`${apiBase}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imgUrl,
            is_carousel_item: true,
            access_token: IG_ACCESS_TOKEN,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.id) {
          return { statusCode: 502, headers, body: JSON.stringify({ error: `Görsel container hatası (${imgUrl}): ` + JSON.stringify(data) }) };
        }
        containerIds.push(data.id);
        // Small delay between requests
        await new Promise(r => setTimeout(r, 500));
      }

      // Step 2: Create carousel container
      const carRes = await fetch(`${apiBase}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: containerIds.join(','),
          caption,
          access_token: IG_ACCESS_TOKEN,
        }),
      });
      const carData = await carRes.json();
      if (!carRes.ok || !carData.id) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Carousel container hatası: ' + JSON.stringify(carData) }) };
      }
      creationId = carData.id;
    }

    // Final step: Publish
    await new Promise(r => setTimeout(r, 2000));

    const publishRes = await fetch(`${apiBase}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: IG_ACCESS_TOKEN }),
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Yayın hatası: ' + JSON.stringify(publishData) }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({
      success: true,
      ig_post_id: publishData.id,
      image_count: images.length,
    })};

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
