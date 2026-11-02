export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const update = req.body
  console.log('Webhook:', JSON.stringify(update).substring(0,500))
  if (update?.pre_checkout_query && process.env.BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerPreCheckoutQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }) })
  }
  // Ici tu peux sauvegarder le message dans une DB (Vercel KV, Supabase, etc)
  // Pour l'instant, on log et on répond ok
  if (update?.message) {
    console.log(`Nouveau message de ${update.message.from?.first_name}: ${update.message.text}`)
  }
  return res.status(200).json({ ok: true })
}
