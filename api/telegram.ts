export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { method, token, payload } = req.body
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload||{}) })
    const data = await r.json()
    return res.status(data.ok ? 200 : 400).json(data)
  } catch(e){ return res.status(500).json({error:e.message}) }
}
