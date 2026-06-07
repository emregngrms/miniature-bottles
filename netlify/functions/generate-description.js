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
  const ACCEPTED = ['image/jpeg','image/png','image/gif','image/webp'];
  const safeType = ACCEPTED.includes(mediaType) ? mediaType : 'image/jpeg';

  const catList = (categories||[]).map(c=>`${c.name_en}/${c.name_tr}`).join(', ');
  const COUNTRIES = ['Scotland','England','Wales','Ireland','USA','France','Mexico','Italy','Germany','Venezuela','Spain','Japan','Canada','Australia','Netherlands','Sweden','Russia','Turkey','Greece','Cuba','Jamaica','Barbados','Trinidad','Peru','Brazil','Argentina','South Africa','India','China','Taiwan','Czech Republic','Poland','Hungary','Austria','Switzerland','Belgium','Portugal','Albania','Denmark','Finland','Iceland','Serbia','Croatia','Slovenia','Bosnia','Bulgaria','Romania','Ukraine','Georgia','Armenia','Azerbaijan','Israel','Lebanon','Morocco','South Korea','Vietnam','Thailand','Singapore','New Zealand','Colombia','Chile','Bolivia','Guatemala','Ecuador','Uruguay','Philippines','Indonesia','Malaysia','Kazakhstan','Egypt','Nigeria','Kenya','Diğer'];

  const content = [];
  if (imageBase64) {
    content.push({ type:'image', source:{ type:'base64', media_type: safeType, data: imageBase64 }});
  }

  let prompt;
  if (mode === 'full') {
    prompt = `You are a spirits expert. Analyze this bottle ${imageBase64 ? 'image carefully' : 'information'}.

CRITICAL - Read the label VERY carefully:
- Look for the EXACT brand name on the label (e.g. "Bombay Sapphire" is NOT "Beefeater", "Glenfiddich" is NOT "Glenlivet")
- Read the ABV percentage exactly as shown
- Identify the country of origin from the label or spirit type

${name ? `Hint (user provided, verify against label): "${name}"` : 'No name hint — read label carefully.'}
${catList ? `Available categories: ${catList}` : ''}
Available countries: ${COUNTRIES.join(', ')}

DESCRIPTION RULES — VERY IMPORTANT:
- Write about the SPIRIT ITSELF: its taste, aroma, production method, region, ingredients
- Focus on: tasting notes (fruity, smoky, sweet, dry, spicy etc.), mouthfeel, finish, aroma
- Mention: production region, distillery character, aging (if applicable), key botanicals/grains
- DO NOT write collector language like "rare piece", "valuable addition to your collection", "miniature treasure"
- DO NOT say "this bottle is perfect for collectors" or similar
- Write as if describing the drink to someone who wants to taste it
- Example good style: "Fruity and floral on the nose with notes of apple and pear, the palate offers a gentle sweetness balanced by oak spice, with a clean medium-length finish."

HASHTAG RULES:
- Always include: #minibottles #minibottlescollection #miniaturebottles
- Add 3-5 relevant tags: spirit type, brand, country/region
- Use lowercase: #scotchwhisky #singlemalt #glenfiddich etc.

Return ONLY this JSON, no other text:
{
  "name": "exact brand name from label",
  "country": "one of the available countries",
  "category": "from available categories, English name",
  "abv": "e.g. 40%",
  "desc_tr": "2-3 sentences. Focus on taste, aroma, finish, production. No collector talk.",
  "desc_en": "Same in English.",
  "hashtags": ["#minibottles","#minibottlescollection","#miniaturebottles","..."]
}`;
  } else {
    prompt = `Spirits expert. Write tasting-focused descriptions for: ${name||'unknown'}${country?` (${country})`:''}${category?` - ${category}`:''}

Focus on: taste, aroma, finish, production method. NO collector/museum language.
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
