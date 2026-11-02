export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const update = req.body
  if (update?.pre_checkout_query && process.env.BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerPreCheckoutQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }) })
  }
  return res.status(200).json({ ok: true })
}
