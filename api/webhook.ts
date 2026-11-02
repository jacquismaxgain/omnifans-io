export default async function handler(req,res){
  const u=req.body
  if(u.pre_checkout_query && process.env.BOT_TOKEN){
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerPreCheckoutQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pre_checkout_query_id:u.pre_checkout_query.id,ok:true})})
  }
  return res.status(200).json({ok:true})
}
