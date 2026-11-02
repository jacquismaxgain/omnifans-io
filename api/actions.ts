export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { type, method, token, payload } = req.body
  try {
    if (type==='telegram_proxy'){
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload||{}) })
      const data = await r.json()
      return res.json(data)
    }
    return res.json({ ok:true, result:{status:'sent'} })
  } catch(e){ return res.status(500).json({error:e.message}) }
}
