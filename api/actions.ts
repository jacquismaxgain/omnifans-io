export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { type, method, token, payload } = req.body || {}
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
    const d = await r.json()
    return res.json(d)
  } catch(e){ return res.status(500).json({error:e.message}) }
}
