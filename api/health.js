
function setCORS(res){
  try{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  }catch{}
}

module.exports = (req, res) => {
  setCORS(res);
  if(req.method==='OPTIONS'){ res.status(204).end(); return; }
  res.status(200).json({
    hasKey: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    env: process.env.VERCEL_ENV || null
  });
};
