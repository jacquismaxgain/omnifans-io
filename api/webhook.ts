
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, message: "Webhook endpoint ready", url: req.headers.host + "/api/webhook" });
  const update = req.body;
  console.log("Webhook received:", JSON.stringify(update));
  // Handle pre_checkout_query for Stars
  if (update?.pre_checkout_query) {
    const token = process.env.BOT_TOKEN || req.query.token;
    if (token) {
      await fetch(`https://api.telegram.org/bot${token}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true })
      });
    }
  }
  return res.status(200).json({ ok: true });
}
