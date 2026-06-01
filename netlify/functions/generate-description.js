exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const apiKey = process.env.BOTTLES_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { name, country, category, abv, imageBase64, mediaType, categories, mode } = body;
  const catList = (categories||[]).map(c=>`${c.name_en}/${c.name_tr}`).join(', ');
  const COUNTRIES = ['Scotland','England','Wales','Ireland','USA','France','Mexico','Italy','Germany','Venezuela','Spain','Japan','Canada','Australia','Netherlands','Sweden','Russia','Turkey','Greece','Cuba','Jamaica','Barbados','Trinidad','Peru','Brazil','Argentina','South Africa','India','China','Taiwan','Czech Republic','Poland','Hungary','Austria','Switzerland','Belgium','Portugal','Albania','Denmark','Finland','Iceland','Serbia','Croatia','Slovenia','Bosnia','Bulgaria','Romania','Ukraine','Georgia','Armenia','Azerbaijan','Israel','Lebanon','Morocco','South Korea','Vietnam','Thailand','Singapore','New Zealand','Colombia','Chile','Bolivia','Guatemala','Ecuador','Uruguay','Philippines','Indonesia','Malaysia','Kazakhstan','Egypt','Nigeria','Kenya','Diğer'];

  // Normalize media_type — Claude only accepts jpeg/png/gif/webp
  const ACCEPTED = ['image/jpeg','image/png','image/gif','image/webp'];
  const safeType = ACCEPTED.includes(mediaType) ? mediaType : 'image/jpeg';

  const content = [];
  if (imageBase64) {
    content.push({ type:'image', source:{ type:'base64', media_type: safeType, data: imageBase64 }});
  }

  let prompt;
  if (mode === 'full') {
    prompt = `You are a spirits expert and miniature bottle collector. Analyze this bottle ${imageBase64?'image':'information'} and fill ALL fields.

${name ? `Name hint: "${name}"` : 'No name — read label carefully.'}
${catList ? `Available categories: ${catList}` : ''}
Available countries: ${COUNTRIES.join(', ')}

HASHTAG RULES:
- Always include: #minibottles #minibottlescollection #miniaturebottles
- Add 3-6 relevant tags based on spirit type, brand, country
- Use lowercase, no spaces, # prefix
- Examples for whisky: #whisky #scotchwhisky #singlemalts
- Examples for vodka: #vodka #premiumvodka
- Examples for Turkish: #rakı #türkiçkisi
- For well-known brands add brand tag: #glenfiddich #jackdaniels #hendricks

Return ONLY this JSON, no other text:
{
  "name": "exact product name from label",
  "country": "must be one of: ${COUNTRIES.slice(0,20).join(', ')}... etc",
  "category": "from available categories, use English name",
  "abv": "e.g. 40%",
  "desc_tr": "2-3 sentence Turkish description. Warm collector voice.",
  "desc_en": "Same in English.",
  "hashtags": ["#minibottles","#minibottlescollection","#miniaturebottles","...more tags"]
}`;
  } else {
    prompt = `Spirits expert. Short descriptions for: ${name||'unknown'}${country?` (${country})`:''}${category?` - ${category}`:''}

Return ONLY: {"desc_tr":"...","desc_en":"...","hashtags":["#minibottles","#minibottlescollection","#miniaturebottles"]}`;
  }

  content.push({ type:'text', text: prompt });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5', max_tokens:700, messages:[{role:'user',content}] }),
    });
    if (!response.ok) {
      const err = await response.text();
      return { statusCode:502, headers, body: JSON.stringify({ error:'API error: '+err }) };
    }
    const data = await response.json();
    const text = data.content?.[0]?.text||'';
    const clean = text.replace(/```json|```/g,'').trim();
    const result = JSON.parse(clean);
    return { statusCode:200, headers, body: JSON.stringify(result) };
  } catch(err) {
    return { statusCode:500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
