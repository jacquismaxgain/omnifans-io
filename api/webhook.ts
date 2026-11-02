
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, message: "Webhook ready", url: "https://" + req.headers.host + "/api/webhook" });
  console.log("Webhook:", JSON.stringify(req.body));
  return res.status(200).json({ ok: true });
}
