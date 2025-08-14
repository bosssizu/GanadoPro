module.exports = (req,res)=>{
  try{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/json; charset=utf-8');
  }catch{}
  const hasKey = !!process.env.OPENAI_API_KEY;
  res.status(200).end(JSON.stringify({ok:true, hasKey, model: process.env.OPENAI_MODEL || 'gpt-4o-mini'}));
};
module.exports.config = { runtime:'nodejs' };
