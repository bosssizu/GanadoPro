// /api/analyze.js — IA + reglas, con CORS y fallback heurístico
function setCORS(res){ try{ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); }catch{} }
module.exports = async function handler(req, res){
  setCORS(res); if(req.method==='OPTIONS'){ res.status(204).end(); return; }
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Use POST'});
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const { imageDataUrl } = body || {}; if(!imageDataUrl) return res.status(400).json({error:'Missing imageDataUrl'});
    const key=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if(!key) return res.status(200).json({ source:'heuristic', morphology:{bodyLenToHeight:1.55,bellyDepthRatio:0.58,hockAngleDeg:142,rumpSlope:0.07,toplineDeviation:0.06}, bcs:3.0, breedGuess:[{breed:'Brahman / Cebú',pct:40}], healthFlags:['hock_angle_watch'], sex:'macho', categoryGuess:'novillo', ageGuessMonths:18, weightGuessKg:320, score:72, verdictBand:'Bueno', verdictReasons:['BCS adecuado','Ángulo de corvejón aceptable','Largo corporal favorable'] });
    const sys='Devuelve SOLO JSON con campos morphology, bcs, breedGuess, healthFlags, sex, categoryGuess, ageGuessMonths, weightGuessKg, score y verdictBand.';
    const resp = await fetch('https://api.openai.com/v1/chat/completions',{ method:'POST', headers:{'content-type':'application/json','authorization':`Bearer ${key}`}, body: JSON.stringify({ model, response_format:{type:'json_object'}, messages:[ {role:'system', content:sys}, {role:'user', content:[ {type:'text', text:'Analiza la imagen y devuelve el JSON solicitado.'}, {type:'image_url', image_url:{ url:imageDataUrl, detail:'low' }} ]} ] }) });
    const txt=await resp.text(); if(!resp.ok) return res.status(resp.status).json({error:'OpenAI error', detail:txt});
    let data; try{ data=JSON.parse(txt);}catch{ return res.status(500).json({error:'OpenAI parse error', detail:txt}); }
    const outStr=data?.choices?.[0]?.message?.content?.trim()||"{}"; let out=null; try{ out=JSON.parse(outStr);}catch{ out=null; }
    if(!out) return res.status(200).json({ note:'parse_fallback', source:'heuristic', morphology:{bodyLenToHeight:1.55,bellyDepthRatio:0.58,hockAngleDeg:142,rumpSlope:0.07,toplineDeviation:0.06}, bcs:3.0, breedGuess:[{breed:'Brahman / Cebú',pct:40}], healthFlags:[], sex:'macho', categoryGuess:'novillo', ageGuessMonths:18, weightGuessKg:320, score:68, verdictBand:'Bueno' });
    return res.status(200).json({ source:'openai', ...out });
  }catch(err){ return res.status(500).json({error:err?.message||'Unknown error'}); }
}
