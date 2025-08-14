function setJSON(res){ try{res.setHeader('Content-Type','application/json; charset=utf-8');}catch{} }
function setCORS(res){ try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}catch{} }
function clamp(n,a,b){return Math.min(b,Math.max(a,n));} function num(x){const n=Number(x);return Number.isFinite(n)?n:NaN;}

function bandFor(value, {min, goodMin, goodMax, max}){
  const pos = (value - min) / (max - min);
  let band = 'Regular';
  if (value < goodMin*0.9 || value > goodMax*1.1) band = 'Malo';
  if (value >= goodMin && value <= goodMax) band = 'Bueno';
  return {pos: clamp(pos,0,1), band, goodMinPos: (goodMin-min)/(max-min), goodMaxPos:(goodMax-min)/(max-min)};
}
function metricGrades(m){
  const ranges={
    bodyLenToHeight:{min:1.1, goodMin:1.50, goodMax:1.75, max:2.1},
    bellyDepthRatio:{min:0.35, goodMin:0.50, goodMax:0.68, max:0.90},
    hockAngleDeg:{min:120, goodMin:138, goodMax:155, max:170},
    toplineDeviation:{min:0.00, goodMin:0.00, goodMax:0.10, max:0.30},
    rumpSlope:{min:-0.10, goodMin:-0.02, goodMax:0.18, max:0.30}
  };
  const out={};
  for(const k of Object.keys(ranges)){
    const v = m[k]; if(v==null) continue;
    out[k] = { value: +v.toFixed(2), ...bandFor(v, ranges[k]), goodMin: ranges[k].goodMin, goodMax: ranges[k].goodMax };
  }
  return out;
}

function estimateBCS5({bellyDepthRatio,toplineDeviation,hockAngleDeg}){
  let base=3.0;
  if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.46) base-=0.6; else if(bellyDepthRatio<=0.66) base+=0.2; else if(bellyDepthRatio>0.70) base-=0.3; }
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.16) base-=0.6; else if(toplineDeviation<0.06) base+=0.2; }
  if(Number.isFinite(hockAngleDeg)&&hockAngleDeg<130) base-=0.2;
  return clamp(+base.toFixed(1),1,5);
}

function strengthsWeaknesses(m){
  const S=[], W=[];
  if((m.toplineDeviation??0)<=0.08) S.push('Línea dorsal recta/estable');
  if((m.hockAngleDeg??145)>=140) S.push('Ángulo de corvejón funcional (buena locomoción)');
  if((m.bellyDepthRatio??0.56)>=0.50 && (m.bellyDepthRatio??0.56)<=0.68) S.push('Capacidad ruminal adecuada sin panza exagerada');
  if((m.bodyLenToHeight??1.6)>=1.55) S.push('Longitud corporal favorable para rendimiento cárnico');
  if((m.hockAngleDeg??150)<130) W.push('Corvejón cerrado (riesgo locomotor)');
  if((m.toplineDeviation??0)>0.18) W.push('Dorso cóncavo (posible menor eficiencia)');
  if((m.bellyDepthRatio??0)>0.72) W.push('Abdomen muy profundo (riesgo de baja conversión)');
  return {strengths:S, weaknesses:W};
}

module.exports=async(req,res)=>{
  setCORS(res); setJSON(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl=body?.imageDataUrl; if(!imageDataUrl) return res.status(400).end(JSON.stringify({error:'Falta imageDataUrl'}));

    // DEMO determinista (sin clave)
    const h = require('crypto').createHash('md5').update(imageDataUrl).digest('hex');
    const seed = parseInt(h.slice(0,8),16);
    const morphology={
      bodyLenToHeight: clamp(+((1.50 + (seed%18)/100).toFixed(2)),1.1,2.1),
      bellyDepthRatio: clamp(+((0.50 + ((seed>>3)%18)/100).toFixed(2)),0.35,0.9),
      hockAngleDeg: clamp(138 + ((seed>>5)%18),120,170),
      toplineDeviation: clamp(+((0.04 + ((seed>>7)%9)/100).toFixed(2)),0,0.3),
      rumpSlope: clamp(+((0.00 + ((seed>>9)%18)/100).toFixed(2)), -0.1, 0.3)
    };
    const grades = metricGrades(morphology);

    let bcs = estimateBCS5(morphology);
    const bcs9 = +(2*bcs-1).toFixed(1);

    const fProp = 1 - Math.min(1, Math.abs(morphology.bodyLenToHeight-1.62)/0.45);
    const fTop  = 1 - Math.min(1, (morphology.toplineDeviation)/0.20);
    const fHoc  = 1 - Math.min(1, Math.abs(morphology.hockAngleDeg-146)/28);
    const fBcs  = Math.min(1, Math.max(0, (bcs9-3)/6));
    let score = Math.round(100*(0.34*fProp + 0.28*fTop + 0.22*fHoc + 0.16*fBcs));
    score = clamp(score,0,100);
    const verdictBand = score>=90?'Excelente': score>=72?'Bueno': score>=58?'Regular': score>=45?'Malo':'Muy malo';

    const {strengths, weaknesses} = strengthsWeaknesses(morphology);
    const explanation = `Para ENGORDE: proporciones ${morphology.bodyLenToHeight>=1.55?'favorables':'aceptables'}, línea dorsal ${morphology.toplineDeviation<=0.08?'estable':'con ligera desviación'}, y corvejón ~${morphology.hockAngleDeg}°. BCS estimado ${bcs.toFixed(1)} (1–5).`;

    const v=verdictBand.toLowerCase();
    let decision='COMPRAR', note='—';
    if(v.includes('muy malo')||v.includes('malo')||(morphology.hockAngleDeg<130)||(morphology.toplineDeviation>0.22)||(bcs<1.8)){
      decision='NO COMPRAR'; note='Estructura/condición no apta para engorde eficiente.';
    } else if(v.includes('regular')){
      decision='COMPRAR (conservador)'; note='Oferta en tramo bajo del rango local.';
    } else if(v.includes('bueno')){
      decision='COMPRAR'; note='Se admite algo sobre el promedio si hay demanda.';
    } else if(v.includes('excelente')){
      decision='COMPRAR'; note='Rango alto sin llegar al tope.';
    }
    const base=[1400,1650];
    let recMin=Math.round(base[0]*(v.includes('regular')?0.9:v.includes('bueno')?1.08:v.includes('excelente')?1.15:1));
    let recMax=Math.round(base[1]*(v.includes('regular')?1.0:v.includes('bueno')?1.12:v.includes('excelente')?1.20:1));
    recMax=Math.min(recMax,1800);

    res.status(200).end(JSON.stringify({
      source:'heuristic',
      morphology, metricGrades:grades,
      bcs, bcs9, score, verdictBand,
      strengths, weaknesses, explanation,
      decision, priceMinCRCkg:recMin, priceMaxCRCkg:recMax, note,
      sex:null, categoryGuess:'engorde', ageGuessMonths:null, weightGuessKg:null
    }));
  }catch(e){
    res.status(500).end(JSON.stringify({error:'API error', detail:String(e)}));
  }
};
module.exports.config={runtime:'nodejs'};
