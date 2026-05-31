exports.handler = async (event) => {
  // Only POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // CORS preflight
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const apiKey = process.env.BOTTLES_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { name, country, category, abv, year, imageBase64, mediaType } = body;

  if (!name) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) };
  }

  // Build message content
  const content = [];

  // Add image if provided
  if (imageBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }

  content.push({
    type: 'text',
    text: `Sen bir alkol uzmanı ve koleksiyoncu yazarısın. Aşağıdaki minyatür şişe için koleksiyon sitesine kısa, bilgilendirici açıklamalar yaz.

Şişe Bilgileri:
- Ad: ${name}
- Ülke: ${country || 'bilinmiyor'}
- Kategori: ${category || 'bilinmiyor'}
- Alkol Oranı: ${abv || 'bilinmiyor'}
- Yıl: ${year || ''}
${imageBase64 ? '- Görselde şişenin fotoğrafı var, etiketi de dikkate al.' : ''}

Kurallar:
- Her açıklama 2-3 cümle, max 60 kelime
- Üretim bölgesi, damak notaları (tasting notes), karakter ve kısa tarihçe
- Samimi ve tutkulı koleksiyoncu sesi, aşırı reklam dili kullanma
- Türkçe açıklamada Türkçe damak notu terimlerini kullan

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{"desc_tr": "...", "desc_en": "..."}`,
  });

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
        max_tokens: 400,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Anthropic API error: ' + err }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response, handle possible markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    if (!result.desc_tr || !result.desc_en) {
      throw new Error('Unexpected response format');
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
