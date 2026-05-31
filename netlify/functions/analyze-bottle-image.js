exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const apiKey = process.env.BOTTLES_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { imageUrl, slug } = body;
  if (!imageUrl) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'imageUrl required' }) };
  }

  try {
    // Fetch the image from Netlify hosted URL
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const imgBuffer = await imgRes.arrayBuffer();
    const b64 = Buffer.from(imgBuffer).toString('base64');
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

    const prompt = `You are a spirits and alcohol expert. Analyze this miniature bottle image and identify the product.

Return ONLY this JSON with no other text:
{
  "name": "exact brand and product name as shown on label",
  "country": "country of origin (e.g. Scotland, France, USA)",
  "category": "spirit category (e.g. Single Malt Whisky, Vodka, Gin, Rum, Tequila, Liqueur, Cognac, Brandy, Rakı)",
  "abv": "alcohol percentage if visible on label (e.g. 40%), otherwise estimate based on spirit type",
  "desc_tr": "2-3 sentence Turkish description: origin, tasting notes, character. Collector's voice, informative.",
  "desc_en": "Same content in English, 2-3 sentences."
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: b64 } },
            { type: 'text', text: prompt }
          ]
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Claude API error: ' + err }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    // Generate slug from name if provided
    if (result.name && slug) {
      // Keep existing slug
      result.slug = slug;
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
