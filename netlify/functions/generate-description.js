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

  const { name, country, category, abv, year, imageBase64, mediaType, categories, mode } = body;
  // mode: 'full' = fill all fields, 'desc' = descriptions only (legacy)

  const catList = (categories || []).map(c => `${c.name_en} / ${c.name_tr}`).join(', ');
  const COUNTRIES = [
    'Scotland','England','Wales','Ireland','USA','France','Mexico','Italy',
    'Germany','Venezuela','Spain','Japan','Canada','Australia','Netherlands',
    'Sweden','Russia','Turkey','Greece','Cuba','Jamaica','Barbados','Trinidad',
    'Peru','Brazil','Argentina','South Africa','India','China','Taiwan',
    'Czech Republic','Poland','Hungary','Austria','Switzerland','Belgium',
    'Portugal','Albania','Denmark','Finland','Iceland','Serbia','Croatia',
    'Slovenia','Bosnia','Bulgaria','Romania','Ukraine','Georgia','Armenia',
    'Azerbaijan','Israel','Lebanon','Morocco','South Korea','Vietnam',
    'Thailand','Singapore','New Zealand','Colombia','Chile','Bolivia',
    'Guatemala','Ecuador','Uruguay','Philippines','Indonesia','Malaysia',
    'Kazakhstan','Egypt','Nigeria','Kenya','Diğer'
  ];

  const content = [];

  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
    });
  }

  let prompt;

  if (mode === 'full') {
    prompt = `You are a spirits expert and miniature bottle collector. Analyze this bottle ${imageBase64 ? 'image' : 'information'} and fill in ALL fields.

${name ? `Current name hint: "${name}"` : 'No name provided — read label.'}
${catList ? `Available categories: ${catList}` : ''}
Available countries: ${COUNTRIES.join(', ')}

Return ONLY this JSON, no other text:
{
  "name": "exact product name from label (brand + variant, e.g. Glenfiddich 12 Year Old)",
  "country": "country of origin — must be one of the available countries listed above",
  "category": "spirit category — pick the most appropriate from available categories, use English name",
  "abv": "alcohol percentage as shown on label, e.g. 40% — estimate if not visible",
  "desc_tr": "2-3 sentence Turkish description: origin region, production method, tasting notes, character. Warm collector's voice.",
  "desc_en": "Same content in English, 2-3 sentences."
}`;
  } else {
    // Legacy: descriptions only
    prompt = `Spirits expert and collector writer. Write short descriptions for this miniature bottle.

Bottle: ${name || 'unknown'}${country ? ` | ${country}` : ''}${category ? ` | ${category}` : ''}${abv ? ` | ${abv}` : ''}
${imageBase64 ? 'Image provided — check label.' : ''}

Return ONLY this JSON:
{"desc_tr": "...", "desc_en": "..."}`;
  }

  content.push({ type: 'text', text: prompt });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'API error: ' + err }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
