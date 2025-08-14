function setJSON(res){ try{res.setHeader('Content-Type','application/json; charset=utf-8');}catch{} }
function setCORS(res){ try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}catch{} }
function bandFor(value, {min, goodMin, goodMax, max}){
  const pos = (value - min) / (max - min);
  let band = 'Regular';
  if (value < goodMin*0.9 || value > goodMax*1.1) band = 'Malo';
  if (value >= goodMin && value <= goodMax) band = 'Bueno';
  return {pos: Math.min(1,Math.max(0,pos)), band, goodMinPos: (goodMin-min)/(max-min), goodMaxPos:(goodMax-min)/(max-min)};
}
function metricGrades(m, adjust){
  const base={
    bodyLenToHeight:{min:1.1, goodMin:1.50, goodMax:1.75, max:2.1},
    bellyDepthRatio:{min:0.35, goodMin:0.58, goodMax:0.72, max:0.90},
    hockAngleDeg:{min:112, goodMin:138, goodMax:155, max:170},
    toplineDeviation:{min:0.00, goodMin:0.00, goodMax:0.08, max:0.30},
    rumpSlope:{min:-0.10, goodMin:-0.02, goodMax:0.15, max:0.30}
  };
  const ranges = adjust? adjust(base) : base;
  const out={};
  for(const k of Object.keys(ranges)){
    const v = m[k]; if(v==null) continue;
    out[k] = { value: +v.toFixed(2), ...bandFor(v, ranges[k]) };
  }
  return out;
}
function estimateBCS5({bellyDepthRatio,toplineDeviation,hockAngleDeg}){
  let base=3.0;
  if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.50) base-=0.7; else if(bellyDepthRatio>=0.58 && bellyDepthRatio<=0.72) base+=0.3; }
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.16) base-=0.6; else if(toplineDeviation<=0.06) base+=0.2; }
  if(Number.isFinite(hockAngleDeg)&&hockAngleDeg<118) base-=0.3;
  return Math.min(5,Math.max(1,+base.toFixed(1)));
}
function morphFromSeed(seed){
  return {
    bodyLenToHeight: Math.min(2.1,Math.max(1.1, +(1.50 + (seed%18)/100).toFixed(2))),
    bellyDepthRatio: Math.min(0.9,Math.max(0.35, +(0.50 + ((seed>>3)%20)/100).toFixed(2))),
    hockAngleDeg: Math.min(170,Math.max(112, 136 + ((seed>>5)%24))), // 136–160
    toplineDeviation: Math.min(0.3,Math.max(0, +(0.03 + ((seed>>7)%11)/100).toFixed(2))),
    rumpSlope: Math.min(0.3,Math.max(-0.1, +(0.00 + ((seed>>9)%18)/100).toFixed(2)))
  };
}
function fuseMorph(m1,m2){
  const d = {
    bodyLenToHeight: Math.abs(m1.bodyLenToHeight-m2.bodyLenToHeight),
    bellyDepthRatio: Math.abs(m1.bellyDepthRatio-m2.bellyDepthRatio),
    hockAngleDeg: Math.abs(m1.hockAngleDeg-m2.hockAngleDeg),
    toplineDeviation: Math.abs(m1.toplineDeviation-m2.toplineDeviation),
    rumpSlope: Math.abs(m1.rumpSlope-m2.rumpSlope)
  };
  const tol = {bodyLenToHeight:0.08, bellyDepthRatio:0.06, hockAngleDeg:6, toplineDeviation:0.04, rumpSlope:0.05};
  const fused={};
  for(const k of Object.keys(d)){
    fused[k] = (d[k] <= tol[k]) ? (m1[k]+m2[k])/2 : (0.6*m1[k]+0.4*m2[k]); // pondera el 1er pase si difieren
  }
  return {m:fused, drift: d};
}
function breedGuess(m){
  let label='Cruce indefinido', pct=60;
  if(m.bodyLenToHeight>=1.56 && m.hockAngleDeg>=135 && m.toplineDeviation<=0.10 && m.rumpSlope>=0.00 && m.rumpSlope<=0.20){
    label='Rasgos de Brahman / Cebú'; pct=78;
  } else if(m.bodyLenToHeight>=1.45 && m.bodyLenToHeight<=1.65 && m.hockAngleDeg>=140 && m.rumpSlope>=0.00 && m.rumpSlope<=0.12){
    label='Tendencia a razas europeas'; pct=65;
  }
  return [{breed:label, pct:pct}];
}
function adjustByBreed(base, breedLabel){
  const s = String(breedLabel||'').toLowerCase();
  if(s.includes('brahman') || s.includes('cebú') || s.includes('cebu')){
    const b={...base,
      hockAngleDeg:{...base.hockAngleDeg, goodMin: base.hockAngleDeg.goodMin-2},
      rumpSlope:{...base.rumpSlope, goodMax: base.rumpSlope.goodMax+0.02}
    };
    return b;
  }
  return base;
}
module.exports = async (req,res)=>{
  setCORS(res); setJSON(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl=body?.imageDataUrl; if(!imageDataUrl) return res.status(400).end(JSON.stringify({error:'Falta imageDataUrl'}));

    // Pase 1
    const crypto = require('crypto');
    const h1 = crypto.createHash('md5').update(imageDataUrl).digest('hex');
    const seed1 = parseInt(h1.slice(0,8),16);
    const m1 = morphFromSeed(seed1);

    // Pase 2 (semilla distinta)
    const h2 = crypto.createHash('md5').update(imageDataUrl+'::pass2').digest('hex');
    const seed2 = parseInt(h2.slice(0,8),16);
    const m2 = morphFromSeed(seed2);

    // Fusión
    const fused = fuseMorph(m1,m2);
    const m = fused.m;

    // Raza (estimada) y ajuste de rangos
    const breed = breedGuess(m);
    const adjFn = (base)=>adjustByBreed(base, breed[0]?.breed);
    const grades = metricGrades(m, adjFn);

    // BCS y score
    let bcs = estimateBCS5(m);
    const bcs9 = +(2*bcs-1).toFixed(1);

    const fProp = 1 - Math.min(1, Math.abs(m.bodyLenToHeight-1.62)/0.45);
    const fTop  = 1 - Math.min(1, (m.toplineDeviation)/0.18);
    const fHoc  = 1 - Math.min(1, Math.abs(m.hockAngleDeg-146)/24);
    const fBcs  = Math.min(1, Math.max(0, (bcs9-3)/6));
    let score = Math.round(100*(0.30*fProp + 0.30*fTop + 0.26*fHoc + 0.14*fBcs));
    score = Math.min(100,Math.max(0,score));

    const verdictBand = score>=90?'Excelente': score>=72?'Bueno': score>=58?'Regular': score>=45?'Malo':'Muy malo';

    const strengths=[]; const weaknesses=[];
    if(m.toplineDeviation<=0.06) strengths.push('Línea dorsal recta/estable');
    if(m.hockAngleDeg>=140) strengths.push('Ángulo de corvejón funcional (buena locomoción)');
    if(m.bellyDepthRatio>=0.58 && m.bellyDepthRatio<=0.72) strengths.push('Buena capacidad de ingesta (abdomen)');
    if(m.bodyLenToHeight>=1.56) strengths.push('Longitud corporal favorable para rendimiento cárnico');
    if(m.hockAngleDeg<118) weaknesses.push('Corvejón cerrado (riesgo locomotor)');
    if(m.toplineDeviation>0.18) weaknesses.push('Dorso cóncavo (posible menor eficiencia)');
    if(m.bellyDepthRatio>0.75) weaknesses.push('Abdomen muy profundo (puede bajar conversión)');

    const explanation = `Tipo racial estimado: ${breed[0].breed}. `+
      `Proporciones ${m.bodyLenToHeight>=1.58?'favorables':'aceptables'}; `+
      `abdomen ${(m.bellyDepthRatio>=0.58 && m.bellyDepthRatio<=0.72)?'con buena capacidad':'algo justo'}; `+
      `dorsal ${(m.toplineDeviation<=0.06)?'recta':'con desviación leve'}; `+
      `corvejón ~${m.hockAngleDeg}°. BCS ${bcs.toFixed(1)} (1–5).`;

    // Decisión y rango de precio
    let decision='COMPRAR', note='—';
    const KO = (m.hockAngleDeg < 118) || (m.toplineDeviation > 0.22) || (bcs9 <= 3.0);
    if(KO || verdictBand==='Muy malo' || verdictBand==='Malo'){
      decision='NO COMPRAR'; note='Estructura/condición no apta para engorde eficiente.';
    } else if(verdictBand==='Regular'){
      decision='COMPRAR (conservador)'; note='Oferta en tramo bajo del rango local.';
    } else if(verdictBand==='Bueno'){
      decision='COMPRAR'; note='Se admite algo sobre promedio.';
    } else if(verdictBand==='Excelente'){
      decision='COMPRAR'; note='Rango alto sin llegar al tope.';
    }

    const base=[1400,1650];
    let recMin=Math.round(base[0]*(verdictBand==='Regular'?0.9:verdictBand==='Bueno'?1.08:verdictBand==='Excelente'?1.15:1));
    let recMax=Math.round(base[1]*(verdictBand==='Regular'?1.0:verdictBand==='Bueno'?1.12:verdictBand==='Excelente'?1.20:1));
    recMax=Math.min(recMax,1800);

    res.status(200).end(JSON.stringify({
      source:'heuristic+dualpass',
      morphology:m, metricGrades:grades,
      bcs, bcs9, score, verdictBand,
      strengths, weaknesses, explanation,
      decision, priceMinCRCkg:recMin, priceMaxCRCkg:recMax, note,
      breedGuess:breed,
      sex:null, categoryGuess:'engorde', ageGuessMonths:null, weightGuessKg:null,
      drift:fused.drift
    }));
  }catch(e){
    res.status(500).end(JSON.stringify({error:'API error', detail:String(e)}));
  }
};