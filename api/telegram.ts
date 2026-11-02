export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { method, token, payload } = req.body || {}
  if (!token || !method) return res.status(400).json({ error: 'token & method required' })
  try {
    const url = `https://api.telegram.org/bot${token}/${method}`
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
    const data = await r.json()
    return res.status(data.ok ? 200 : 400).json(data)
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
