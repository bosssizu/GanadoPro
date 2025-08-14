module.exports = (req,res)=>{
  try{res.setHeader('Access-Control-Allow-Origin','*');}catch{}
  const hasKey = !!process.env.OPENAI_API_KEY;
  res.status(200).json({ok:true, hasKey, model: process.env.OPENAI_MODEL || 'gpt-4o-mini'});
};
module.exports.config = { runtime:'nodejs' };
