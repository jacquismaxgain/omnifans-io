export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  return res.json({ ok: true, result: { status: 'sent', message: 'PPV MYM envoyé via OmniFans.io' } })
}
