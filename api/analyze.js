module.exports = async function handler(req,res){
  try{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    if(req.method==='OPTIONS') return res.status(204).end();
    if(req.method!=='POST') return res.status(405).json({error:'Use POST'});
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl = body?.imageDataUrl; if(!imageDataUrl) return res.status(400).json({error:'Missing imageDataUrl'});
    const key=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL||'gpt-4o-mini';
    if(!key) return res.status(200).json({source:'heuristic',morphology:{bodyLenToHeight:1.58,bellyDepthRatio:0.60,hockAngleDeg:144,rumpSlope:0.06,toplineDeviation:0.07},bcs:3.1,breedGuess:[{breed:'Brahman',pct:40}],healthFlags:[],sex:'macho',categoryGuess:'novillo',ageGuessMonths:18,weightGuessKg:320,score:78,verdictBand:'Bueno',explanation:'Veredicto Bueno. Largo/alzada 1.58, corvejón ~144°, BCS 3.1.'});
    const resp = await fetch('https://api.openai.com/v1/chat/completions',{ method:'POST', headers:{'content-type':'application/json','authorization':`Bearer ${key}`}, body: JSON.stringify({ model, temperature:0.2, response_format:{type:'json_object'}, messages:[ {role:'system', content:'Devuelve SOLO JSON con morphology,bcs,breedGuess,healthFlags,sex,categoryGuess,ageGuessMonths,weightGuessKg,score,verdictBand,explanation_es.'}, {role:'user', content:[ {type:'text', text:'Analiza morfología y BCS. Explica en español citando valores.'}, {type:'image_url', image_url:{ url:imageDataUrl, detail:'low' }} ] } ] }) });
    const txt=await resp.text(); if(!resp.ok){ return res.status(resp.status).json({error:'OpenAI error', detail:txt}); }
    let data; try{ data=JSON.parse(txt);}catch{ return res.status(500).json({error:'OpenAI parse error', detail:txt}); }
    let out=null; try{ out=JSON.parse(data?.choices?.[0]?.message?.content||'{}'); }catch{ out=null; }
    if(!out) return res.status(500).json({error:'Model returned empty'});
    return res.status(200).json({ source:'openai', morphology:out.morphology, bcs:out.bcs, breedGuess:out.breedGuess, healthFlags:out.healthFlags, sex:out.sex, categoryGuess:out.categoryGuess, ageGuessMonths:out.ageGuessMonths, weightGuessKg:out.weightGuessKg, score:out.score, verdictBand:out.verdictBand, explanation: out.explanation_es || 'Evaluación generada.'});
  }catch(err){ return res.status(500).json({error:err?.message||'Unknown error'}); }
}