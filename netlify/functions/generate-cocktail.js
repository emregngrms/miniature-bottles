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

  const { name, bottleNames } = body;
  if (!name) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };
  }

  const bottleList = (bottleNames || []).slice(0, 30).join(', ');

  const prompt = `Spirits expert. Generate a ${name} cocktail recipe as JSON only.
Available bottles in collection: ${bottleList || 'standard spirits'}

Rules:
- Use ONLY bottles from the available list for slugs field (match by name similarity, 1-4 bottles)
- ing_tr/ing_en: 4-6 ingredients with amounts, one per item
- steps_tr/steps_en: 3-4 concise steps, one per item  
- time: e.g. "3 dk" / "5 dk"
- diff: "Kolay"/"Orta"/"Zor" | diff_en: "Easy"/"Medium"/"Hard"

Return ONLY this JSON, nothing else:
{"diff":"...","diff_en":"...","time":"...","slugs":["slug1"],"ing_tr":["..."],"ing_en":["..."],"steps_tr":["..."],"steps_en":["..."]}`;

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
        messages: [{ role: 'user', content: prompt }],
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
