export default async function handler(req, res) {
  const update = req.body
  if (update.pre_checkout_query) {
    const token = process.env.BOT_TOKEN
    if (token) await fetch(`https://api.telegram.org/bot${token}/answerPreCheckoutQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }) })
  }
  return res.status(200).json({ ok: true })
}
