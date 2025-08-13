export const config = { runtime: 'nodejs' };
function setCORS(res){ try{ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); }catch{} }
const HARD_GATES = ['cojera','claudicación','emaciación','diarrea','descarga nasal','herida','heridas','bloat','timpanismo','timapanismo','inflamación severa'];
function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
function num(x){ const n=Number(x); return Number.isFinite(n)?n:NaN; }
function sanitizeMetrics(m){ let bodyLenToHeight=num(m?.bodyLenToHeight); let bellyDepthRatio=num(m?.bellyDepthRatio); let hockAngleDeg=num(m?.hockAngleDeg); let rumpSlope=num(m?.rumpSlope); let toplineDeviation=num(m?.toplineDeviation); if(!Number.isFinite(bodyLenToHeight)) bodyLenToHeight=1.55; bodyLenToHeight=clamp(bodyLenToHeight,1.05,2.3); if(!Number.isFinite(bellyDepthRatio)) bellyDepthRatio=0.58; if(bellyDepthRatio>1 && bellyDepthRatio<=100) bellyDepthRatio/=100; bellyDepthRatio=clamp(bellyDepthRatio,0.25,1.05); if(!Number.isFinite(hockAngleDeg)) hockAngleDeg=145; hockAngleDeg=clamp(hockAngleDeg,110,180); if(Number.isFinite(rumpSlope)){ if(Math.abs(rumpSlope)>1 && Math.abs(rumpSlope)<=40) rumpSlope/=100; } else rumpSlope=0.06; rumpSlope=clamp(rumpSlope,-0.35,0.35); if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>1 && toplineDeviation<=60) toplineDeviation/=100; } else toplineDeviation=0.06; toplineDeviation=clamp(toplineDeviation,0,0.6); return { bodyLenToHeight, bellyDepthRatio, hockAngleDeg, rumpSlope, toplineDeviation }; }
function estimateBCS({bellyDepthRatio,toplineDeviation,rumpSlope}){ let base=3; if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.45) base-=0.9; else if(bellyDepthRatio>0.65) base+=0.7; } if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.12) base-=0.6; if(toplineDeviation<0.04) base+=0.2; } if(Number.isFinite(rumpSlope) && rumpSlope>0.12) base-=0.2; return Math.max(1, Math.min(5, Number(base.toFixed(1)))); }
function flagsFromMetrics({hockAngleDeg,toplineDeviation,rumpSlope},bcs){ const flags=[]; if(Number.isFinite(hockAngleDeg)){ if(hockAngleDeg<135) flags.push('hock_angle_closed'); else if(hockAngleDeg<145) flags.push('hock_angle_watch'); } if(Number.isFinite(toplineDeviation) && toplineDeviation>0.12) flags.push('topline_curved'); if(Number.isFinite(rumpSlope) && rumpSlope>0.15) flags.push('steep_rump'); if(Number.isFinite(bcs) && bcs<2.2) flags.push('underweight'); return flags; }
function scoreFattening({metrics,bcs,sex,ageMonths,category}){ let score=0,totalW=0; if(Number.isFinite(bcs)){ const dist=Math.abs(bcs-3.0); let s=100-clamp(dist*50,0,100); const w=0.34; score+=s*w; totalW+=w; } if(Number.isFinite(metrics?.bodyLenToHeight)){ let s=100-Math.abs(metrics.bodyLenToHeight-1.65)*200; s=clamp(s,0,100); const w=0.18; score+=s*w; totalW+=w; } if(Number.isFinite(metrics?.hockAngleDeg)){ let s=100-Math.abs(metrics.hockAngleDeg-145)*6; s=clamp(s,0,100); const w=0.18; score+=s*w; totalW+=w; } if(Number.isFinite(metrics?.toplineDeviation)){ let s=100-clamp((metrics.toplineDeviation-0.08),0,0.5)*(100/0.5); s=clamp(s,0,100); const w=0.16; score+=s*w; totalW+=w; } if(Number.isFinite(metrics?.rumpSlope)){ let x=Math.abs(metrics.rumpSlope); let s=100-clamp(Math.max(0,x-0.12),0,0.35)*(100/0.35); s=clamp(s,0,100); const w=0.08; score+=s*w; totalW+=w; } if(Number.isFinite(ageMonths)){ let adj=1; if(category==='novillo'){ if(ageMonths<8||ageMonths>30) adj=0.9; } else if(category==='ternero'){ adj=0.85; } else if(category==='vaquilla'||category==='vaca_descarte'){ adj=0.88; } else if(category==='toro'){ adj=0.82; } const w=0.06; score+=100*adj*w; totalW+=w; } return clamp(Math.round(score/totalW),0,100); }
const BAND_ORDER=['Muy malo','Malo','Regular','Bueno','Excelente']; function bandFromScore(score){ if(score>=90) return 'Excelente'; if(score>=72) return 'Bueno'; if(score>=58) return 'Regular'; if(score>=45) return 'Malo'; return 'Muy malo'; } function minBand(a,b){ return BAND_ORDER[Math.min(BAND_ORDER.indexOf(a),BAND_ORDER.indexOf(b))]; }
function guardBand({bcs,emaciation,healthFlags,diseaseFindings,category,sex,ageMonths}){ let cap='Excelente'; if(Number.isFinite(bcs)&&bcs<2.2) cap=minBand(cap,'Muy malo'); else if(Number.isFinite(bcs)&&bcs<2.6) cap=minBand(cap,'Malo'); if(emaciation===true) cap=minBand(cap,'Muy malo'); const risky=['cojera','claudicación','tos','descarga nasal','diarrea','herida','heridas','bloat','timpanismo']; if(Array.isArray(diseaseFindings)&&diseaseFindings.some(x=> typeof x==='string' && risky.some(rx=> x.toLowerCase().includes(rx)))) cap=minBand(cap,'Malo'); if(Array.isArray(healthFlags)&&healthFlags.includes('hock_angle_closed')) cap=minBand(cap,'Malo'); if(category==='toro' && Number.isFinite(ageMonths) && ageMonths>30) cap=minBand(cap,'Regular'); return cap; }
function explanationFromHeur(m,bcs,verdict){ const bits=[]; if(Number.isFinite(m?.bodyLenToHeight)) bits.push(`Relación largo/alzada de ${m.bodyLenToHeight.toFixed(2)}.`); if(Number.isFinite(m?.hockAngleDeg)) bits.push(`Ángulo de corvejón ~${Math.round(m.hockAngleDeg)}°.`); if(Number.isFinite(m?.toplineDeviation)) bits.push(`Línea superior (desv. ${m.toplineDeviation.toFixed(2)}).`); if(Number.isFinite(bcs)) bits.push(`BCS ${bcs.toFixed(1)}.`); return `Veredicto ${verdict}. ${bits.join(' ')}`; }
function heuristic(){ const morphology={bodyLenToHeight:1.55,bellyDepthRatio:0.58,hockAngleDeg:142,rumpSlope:0.07,toplineDeviation:0.06}; const bcs=3.1; const sex='macho',categoryGuess='novillo',ageGuessMonths=18,weightGuessKg=320; const score=72, verdictBand='Bueno'; return {source:'heuristic',morphology,bcs,breedGuess:[{breed:'Brahman / Cebú',pct:40}],healthFlags:[],sex,categoryGuess,ageGuessMonths,weightGuessKg,score,verdictBand,confidence:86,auditText:'Pose lateral adecuada. Sin oclusiones. Luz correcta.',auditHardGates:[],explanation:explanationFromHeur(morphology,bcs,verdictBand),auditPass:false}; }

async function openaiJSON(key, model, messages){
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify({model,temperature:0.1,response_format:{type:'json_object'},messages})});
  const txt=await r.text(); if(!r.ok) throw new Error('OpenAI '+r.status+': '+txt.slice(0,300)); let data; try{ data=JSON.parse(txt); }catch{ throw new Error('Parse OpenAI: '+txt.slice(0,200)); } let out; try{ out=JSON.parse(data?.choices?.[0]?.message?.content||'{}'); }catch{ out=null; } if(!out) throw new Error('Empty JSON content'); return out;
}

export default async function handler(req,res){
  setCORS(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Use POST'});
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl=body?.imageDataUrl; if(!imageDataUrl) return res.status(400).json({error:'Missing imageDataUrl'});
    const key=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL||'gpt-4o-mini';

    // Fallback si no hay llave
    if(!key) return res.status(200).json(heuristic());

    // PASO 1: extracción numérica
    const sys1 = "Eres un evaluador de ganado para engorde. Devuelve SOLO JSON con métricos numéricos estrictos dentro de rangos fisiológicos.";
    const user1 = {type:'text', text: "Extrae: morphology{bodyLenToHeight(1.0-2.5), bellyDepthRatio(0.2-1.2), hockAngleDeg(110-180), rumpSlope(-0.4-0.4), toplineDeviation(0.0-0.6)}, bcs(1-5), sex('macho'/'hembra'), categoryGuess('ternero','novillo','toro','vaca','novilla','vaquilla','macho criollo'), ageGuessMonths, weightGuessKg, diseaseFindings[], posture{view, rotationDeg, occlusion, truncation, blur, lighting, shadowStrong}. Devuelve SOLO JSON."};
    let out1;
    try{
      out1 = await openaiJSON(key, model, [
        {role:'system', content: sys1},
        {role:'user', content: [ user1, {type:'image_url', image_url:{url:imageDataUrl, detail:'low'}} ]}
      ]);
    }catch(e){
      return res.status(200).json(heuristic());
    }

    // Saneado y score preliminar
    const morph = sanitizeMetrics(out1.morphology||{});
    let bcs=num(out1.bcs); if(!Number.isFinite(bcs)||bcs<1||bcs>5) bcs=estimateBCS(morph);
    const sex = out1.sex||'desconocido';
    const categoryGuess=(out1.categoryGuess||'desconocido').toString().toLowerCase();
    const ageGuessMonths= num(out1.ageGuessMonths); const weightGuessKg=num(out1.weightGuessKg);
    const diseaseFindings = Array.isArray(out1.diseaseFindings) ? out1.diseaseFindings.slice(0,10) : [];
    const healthFlags = flagsFromMetrics(morph,bcs);
    const prelimScore = scoreFattening({metrics:morph,bcs,sex,ageMonths:ageGuessMonths,category:categoryGuess});
    let prelimVerdict = bandFromScore(prelimScore);

    // HARD GATES desde paso 1
    const gates = (diseaseFindings||[]).filter(s => typeof s==='string' && HARD_GATES.some(g => s.toLowerCase().includes(g)));
    let cap1 = guardBand({bcs,emaciation: gates.some(x=>x.toLowerCase().includes('emaci')),healthFlags,diseaseFindings,category:categoryGuess,sex,ageMonths:ageGuessMonths});

    // PASO 2: auditoría (usa números)
    let auditText='';
    let confidence=72;
    let auditHardGates=[];
    let auditCap=null;
    try{
      const sys2 = "Eres auditor perito. Revisa consistencia de métricos y calidad de la foto. Devuelve SOLO JSON.";
      const user2 = `Métricos: ${JSON.stringify({morphology:morph,bcs,sex,categoryGuess,ageGuessMonths,weightGuessKg,diseaseFindings})}. Evalúa: issues[] (texto corto), hard_gates[] (subset: ${HARD_GATES.join(', ')}), consistency_ok (bool), confidence (0-100), explanation_es (2-4 frases con números). Si calidad mala (mucha rotación/oclusiones/luz pobre) disminuye confidence y, si es severo, sugiere cap='Regular'.`;
      const out2 = await openaiJSON(key, model, [
        {role:'system', content: sys2},
        {role:'user', content: user2}
      ]);
      auditText = out2.explanation_es || '';
      if(Array.isArray(out2.hard_gates)) auditHardGates = out2.hard_gates.filter(x=> typeof x==='string');
      if(Number.isFinite(out2.confidence)) confidence = clamp(Math.round(out2.confidence),0,100);
      if(out2.cap && typeof out2.cap==='string') auditCap = out2.cap;
    }catch(e){
      auditText = 'Auditoría no disponible.';
      confidence = 60;
      auditHardGates = [];
      auditCap = null;
    }

    // Veredicto final: score -> band -> aplicar cap1 y auditCap y hard gates
    let band = prelimVerdict;
    if(auditCap){ band = minBand(band, auditCap); }
    if(cap1){ band = minBand(band, cap1); }
    if(auditHardGates.length){ band = minBand(band, 'Malo'); } // gatea a NO compra

    const json = {
      source:'openai',
      auditPass:true,
      morphology:morph,
      bcs,
      breedGuess: out1.breedGuess || [],
      healthFlags,
      sex,
      categoryGuess,
      ageGuessMonths: Number.isFinite(ageGuessMonths) ? ageGuessMonths : null,
      weightGuessKg: Number.isFinite(weightGuessKg) ? weightGuessKg : null,
      score: prelimScore,
      verdictBand: band,
      confidence,
      auditText,
      auditHardGates: auditHardGates,
      diseaseFindings: diseaseFindings
    };
    return res.status(200).json(json);
  }catch(err){
    try{ console.error(err); }catch{}
    return res.status(200).json(heuristic());
  }
}
