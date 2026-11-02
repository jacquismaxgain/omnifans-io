export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { type, method, token, payload } = req.body
  try {
    if (type === 'telegram_proxy') {
      const url = `https://api.telegram.org/bot${token}/${method}`
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
      const data = await r.json()
      return res.json(data)
    }
    return res.json({ ok: true })
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
