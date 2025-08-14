function setJSON(res){ try{res.setHeader('Content-Type','application/json; charset=utf-8');}catch{} }
function setCORS(res){ try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}catch{} }
function clamp(n,a,b){return Math.min(b,Math.max(a,n));} function num(x){const n=Number(x);return Number.isFinite(n)?n:NaN;}
function estimateBCS5({bellyDepthRatio,toplineDeviation,rumpSlope,hockAngleDeg}){ let base=3.0; if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.42) base-=0.8; else if(bellyDepthRatio<0.50) base-=0.4; else if(bellyDepthRatio<=0.65) base+=0.2; else if(bellyDepthRatio>0.70) base-=0.3; } if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.18) base-=0.9; else if(toplineDeviation>0.12) base-=0.6; else if(toplineDeviation<0.05) base+=0.2; } if(Number.isFinite(rumpSlope)&&rumpSlope>0.15) base-=0.2; if(Number.isFinite(hockAngleDeg)&&hockAngleDeg<125) base-=0.2; return clamp(+base.toFixed(1),1,5); }
function cebuAdjustment(bcs5,m){ const okTop=(m.toplineDeviation??0.08)<=0.12; const okHock=(m.hockAngleDeg??145)>=130; const okBelly=(m.bellyDepthRatio??0.56)>=0.48 && (m.bellyDepthRatio??0.56)<=0.70; if(bcs5<=2.2 && okTop && okHock && okBelly){ bcs5=Math.max(3.2,bcs5+1.2);} return clamp(+bcs5.toFixed(1),1,5); }
function subScores(m,bcs5){ const sBCS=Math.round((clamp(bcs5,1,5)-1)/4*100); const sLoco=Math.round((1-Math.min(1,Math.abs((m.hockAngleDeg??145)-145)/35))*100); const sTop=Math.round((1-Math.min(1,(m.toplineDeviation??0)/0.25))*100); const sProp=Math.round((1-Math.min(1,Math.abs((m.bodyLenToHeight??1.6)-1.6)/0.5))*100); return {sBCS,sLoco,sTop,sProp}; }
function makeExplanation(m,bcs9){ const f=[]; if(bcs9>=6) f.push('Buena cobertura muscular sin exceso de grasa.'); if((m.toplineDeviation??0)<=0.10) f.push('Línea dorsal recta/estable.'); if((m.hockAngleDeg??145)>=135) f.push('Ángulo de corvejón funcional.'); if((m.bellyDepthRatio??0.56)>=0.50 && (m.bellyDepthRatio??0.56)<=0.70) f.push('Abdomen con capacidad digestiva adecuada.'); if(!f.length) f.push('Proporciones correctas y locomoción aceptable.'); return f.join(' '); }
async function openaiJSON(key,model,messages){ const controller=new AbortController(); const to=setTimeout(()=>controller.abort(),20000); try{ const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,temperature:0.1,response_format:{type:'json_object'},messages}),signal:controller.signal}); const text=await r.text(); if(!r.ok) throw new Error('OpenAI '+r.status+': '+text.slice(0,240)); const data=JSON.parse(text); const out=JSON.parse(data?.choices?.[0]?.message?.content||"{}"); if(!out||typeof out!=='object') throw new Error('OpenAI vacío'); return out; } finally{ clearTimeout(to); } }
module.exports=async(req,res)=>{ setCORS(res); setJSON(res); if(req.method==='OPTIONS') return res.status(204).end(); try{ if(req.method!=='POST') return res.status(405).end(JSON.stringify({error:'Use POST {imageDataUrl}'})); let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } } const imageDataUrl=body?.imageDataUrl; if(!imageDataUrl) return res.status(400).end(JSON.stringify({error:'Missing imageDataUrl'}));
  const key=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL||'gpt-4o-mini';
  const safeDemo=()=>{ const morphology={bodyLenToHeight:1.60,bellyDepthRatio:0.58,hockAngleDeg:145,rumpSlope:0.08,toplineDeviation:0.08}; let bcs5=3.6; const bcs9=+(2*bcs5-1).toFixed(1); const score=84,verdictBand='Bueno'; const subs=subScores(morphology,bcs5); return {source:'heuristic',morphology,bcs:+bcs5.toFixed(1),bcs9,score,verdictBand,subs,explanation:makeExplanation(morphology,bcs9),strengths:['Línea dorsal estable','Ángulo de corvejón funcional'],weaknesses:[]}; };
  if(!key) return res.status(200).end(JSON.stringify(safeDemo()));
  let out; try{
    const sys="Eres evaluador morfológico de bovinos cebuinos (Brahman y cruces) para engorde. Devuelve SOLO JSON.";
    const user={type:'text',text:`Desde la IMAGEN devuelve JSON con:
- bcs9 (1–9) y bcs5 (1–5)
- morphology { bodyLenToHeight, bellyDepthRatio, hockAngleDeg, rumpSlope, toplineDeviation }
- sex, categoryGuess, ageGuessMonths, weightGuessKg
- strengths[] y weaknesses[] (listas cortas)
Si algo no es fiable, usa null. SOLO JSON.`};
    const content=[user,{type:'image_url',image_url:{url:imageDataUrl,detail:'high'}}];
    out=await openaiJSON(key,model,[{role:'system',content:sys},{role:'user',content:content}]);
  }catch(e){ return res.status(200).end(JSON.stringify(safeDemo())); }
  const m=out.morphology||{};
  const morph={
    bodyLenToHeight: clamp(num(m.bodyLenToHeight)||1.60,1.05,2.30),
    bellyDepthRatio: clamp((num(m.bellyDepthRatio)>1 && num(m.bellyDepthRatio)<=100)? num(m.bellyDepthRatio)/100 : (num(m.bellyDepthRatio)||0.56),0.25,1.05),
    hockAngleDeg: clamp(num(m.hockAngleDeg)||145,110,180),
    rumpSlope: (function(){ const v=num(m.rumpSlope); if(Number.isFinite(v)){ const vv=(Math.abs(v)>1 && Math.abs(v)<=40)? v/100 : v; return clamp(vv,-0.35,0.35);} return 0.08; })(),
    toplineDeviation: clamp((num(m.toplineDeviation)>1 && num(m.toplineDeviation)<=60)? num(m.toplineDeviation)/100 : (num(m.toplineDeviation)||0.08),0,0.6)
  };
  let bcs5=num(out.bcs5); let bcs9=num(out.bcs9);
  if(!Number.isFinite(bcs5) && Number.isFinite(bcs9)) bcs5=0.5*bcs9+0.5;
  if(!Number.isFinite(bcs9) && Number.isFinite(bcs5)) bcs9=2*bcs5-1;
  if(!Number.isFinite(bcs5)) bcs5=estimateBCS5(morph);
  bcs5=cebuAdjustment(bcs5,morph);
  if(!Number.isFinite(bcs9)) bcs9=+(2*bcs5-1).toFixed(1);
  const score=Math.round(100 - Math.abs(morph.bodyLenToHeight-1.65)*40 - Math.abs(morph.hockAngleDeg-145)*0.5 - (morph.toplineDeviation*120) + (bcs5-3)*6);
  const verdictBand= score>=90? 'Excelente' : score>=72? 'Bueno' : score>=58? 'Regular' : score>=45? 'Malo' : 'Muy malo';
  const subs=subScores(morph,bcs5);
  const payload={
    source:'openai', morphology:morph,
    bcs:+clamp(+bcs5.toFixed(1),1,5), bcs9:+clamp(+bcs9.toFixed(1),1,9),
    sex:out.sex||null, categoryGuess:out.categoryGuess||null, ageGuessMonths:out.ageGuessMonths||null, weightGuessKg:out.weightGuessKg||null,
    strengths:Array.isArray(out.strengths)?out.strengths.slice(0,6):[], weaknesses:Array.isArray(out.weaknesses)?out.weaknesses.slice(0,6):[],
    score:Math.max(0,Math.min(100,score)), verdictBand, subs, explanation: makeExplanation(morph,bcs9)
  };
  return res.status(200).end(JSON.stringify(payload));
}catch(err){ const msg=(err&&err.message)?err.message:String(err); return res.status(500).end(JSON.stringify({error:'API error',detail:msg})); }};
module.exports.config={runtime:'nodejs'};
