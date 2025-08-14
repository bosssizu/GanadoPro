function setCORS(res){
  try{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  }catch{}
}
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function num(x){const n=Number(x);return Number.isFinite(n)?n:NaN;}
function estimateBCS({bellyDepthRatio,toplineDeviation,rumpSlope}){
  let base=3;
  if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.45) base-=0.9; else if(bellyDepthRatio>0.65) base+=0.7; }
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.12) base-=0.6; if(toplineDeviation<0.04) base+=0.2; }
  if(Number.isFinite(rumpSlope) && rumpSlope>0.12) base-=0.2;
  return Math.max(1, Math.min(5, Number(base.toFixed(1))));
}
async function openaiJSON(key, model, messages){
  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), 20000);
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json','Authorization':`Bearer ${key}`},
      body:JSON.stringify({model,temperature:0.1,response_format:{type:'json_object'},messages}),
      signal:controller.signal
    });
    const text=await r.text();
    if(!r.ok) throw new Error('OpenAI '+r.status+': '+text.slice(0,200));
    let data; try{ data=JSON.parse(text); }catch{ throw new Error('Parse OpenAI: '+text.slice(0,180)); }
    let out;  try{ out=JSON.parse(data?.choices?.[0]?.message?.content||'{}'); }catch{ out=null; }
    if(!out || typeof out!=='object') throw new Error('OpenAI vacío');
    return out;
  } finally{ clearTimeout(to); }
}
module.exports = async (req,res)=>{
  setCORS(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Use POST {imageDataUrl}'});
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl = body?.imageDataUrl;
    if(!imageDataUrl) return res.status(400).json({error:'Missing imageDataUrl'});

    const key=process.env.OPENAI_API_KEY;
    const model=process.env.OPENAI_MODEL||'gpt-4o-mini';

    if(!key){
      const morphology={bodyLenToHeight:1.62, bellyDepthRatio:0.55, hockAngleDeg:144, rumpSlope:0.07, toplineDeviation:0.07};
      const bcs=3.0, bcs9=2*bcs-1;
      const score=72, verdictBand='Bueno';
      return res.status(200).json({source:'heuristic', morphology, bcs, bcs9, score, verdictBand, explanation:'Sin llave OpenAI: demo heurístico.'});
    }

    const sys = "Eres evaluador morfológico de bovinos para engorde. Devuelve SOLO JSON.";
    const userText = {type:'text', text:`Extrae desde la IMAGEN: 
- bcs5 (1–5), bcs9 (1–9)
- morphology { bodyLenToHeight, bellyDepthRatio, hockAngleDeg, rumpSlope, toplineDeviation }
- sex, categoryGuess, ageGuessMonths, weightGuessKg
Si algo no es fiable, usa null. SOLO JSON.`};
    const content=[ userText, {type:'image_url', image_url:{url:imageDataUrl, detail:'high'}} ];
    let out = await openaiJSON(key, model, [
      {role:'system', content: sys},
      {role:'user', content: content}
    ]);

    const m = out.morphology||{};
    const morph = {
      bodyLenToHeight: clamp(num(m.bodyLenToHeight)||1.58,1.05,2.3),
      bellyDepthRatio: clamp((num(m.bellyDepthRatio)>1 && num(m.bellyDepthRatio)<=100)? num(m.bellyDepthRatio)/100 : (num(m.bellyDepthRatio)||0.56), 0.25, 1.05),
      hockAngleDeg: clamp(num(m.hockAngleDeg)||145,110,180),
      rumpSlope: clamp((Math.abs(num(m.rumpSlope))>1 && Math.abs(num(m.rumpSlope))<=40)? num(m.rumpSlope)/100 : (num(m.rumpSlope)||0.07), -0.35, 0.35),
      toplineDeviation: clamp((num(m.toplineDeviation)>1 && num(m.toplineDeviation)<=60)? num(m.toplineDeviation)/100 : (num(m.toplineDeviation)||0.07), 0, 0.6)
    };

    let bcs5 = num(out.bcs5), bcs9 = num(out.bcs9);
    if(!Number.isFinite(bcs5) && Number.isFinite(bcs9)) bcs5 = 0.5*bcs9 + 0.5;
    if(!Number.isFinite(bcs9) && Number.isFinite(bcs5)) bcs9 = 2*bcs5 - 1;
    let bcs = Number.isFinite(bcs5) ? Math.max(1, Math.min(5, +bcs5.toFixed(1))) : estimateBCS(morph);
    if(!Number.isFinite(bcs9) && Number.isFinite(bcs)) bcs9 = +(2*bcs - 1).toFixed(1);

    const score = Math.round(100 - Math.abs(morph.bodyLenToHeight-1.65)*40 - Math.abs(morph.hockAngleDeg-145)*0.5 - (morph.toplineDeviation*120));
    const verdictBand = score>=90? 'Excelente' : score>=72? 'Bueno' : score>=58? 'Regular' : score>=45? 'Malo' : 'Muy malo';

    return res.status(200).json({
      source: 'openai',
      morphology: morph,
      bcs, bcs9,
      sex: out.sex||null,
      categoryGuess: out.categoryGuess||null,
      ageGuessMonths: out.ageGuessMonths||null,
      weightGuessKg: out.weightGuessKg||null,
      score: Math.max(0,Math.min(100,score)),
      verdictBand,
      explanation: `BCS ${bcs?.toFixed?.(1)}; corvejón ~${Math.round(morph.hockAngleDeg)}°, dorso ${morph.toplineDeviation.toFixed(2)}.`
    });
  }catch(err){
    const msg = (err && err.message) ? err.message : String(err);
    return res.status(500).json({error:'API error', detail: msg});
  }
};
module.exports.config = { runtime:'nodejs' };
