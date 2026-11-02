export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { api_key, payload } = req.body
  return res.json({ ok: true, result: { fan_id: payload?.fan_id, status: 'locked', message: 'PPV OnlyFans envoyé via OmniFans.io' } })
}
