function setJSON(res){ try{res.setHeader('Content-Type','application/json; charset=utf-8');}catch{} }
function setCORS(res){ try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}catch{} }
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}

function bandFor(value, {min, goodMin, goodMax, max}){
  const pos = (value - min) / (max - min);
  let band = 'Regular';
  if (value < goodMin*0.9 || value > goodMax*1.1) band = 'Malo';
  if (value >= goodMin && value <= goodMax) band = 'Bueno';
  return {pos: clamp(pos,0,1), band, goodMinPos: (goodMin-min)/(max-min), goodMaxPos:(goodMax-min)/(max-min)};
}
function metricGrades(m){
  const ranges={
    bodyLenToHeight:{min:1.1, goodMin:1.45, goodMax:1.75, max:2.1},
    bellyDepthRatio:{min:0.35, goodMin:0.50, goodMax:0.70, max:0.90},
    hockAngleDeg:{min:120, goodMin:135, goodMax:155, max:170},
    toplineDeviation:{min:0.00, goodMin:0.00, goodMax:0.12, max:0.30},
    rumpSlope:{min:-0.10, goodMin:-0.02, goodMax:0.18, max:0.30}
  };
  const out={};
  for(const k of Object.keys(ranges)){
    const v = m[k]; if(v==null) continue;
    out[k] = { value: +v.toFixed(2), ...bandFor(v, ranges[k]) };
  }
  return out;
}

module.exports=async(req,res)=>{
  setCORS(res); setJSON(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl=body?.imageDataUrl; if(!imageDataUrl) return res.status(400).end(JSON.stringify({error:'Falta imageDataUrl'}));

    // Heurística determinista (demo) — estable y útil para probar UI
    const h = require('crypto').createHash('md5').update(imageDataUrl).digest('hex');
    const seed = parseInt(h.slice(0,8),16);
    const rand = (a,b)=> a + (seed % 1000)/1000*(b-a);

    const morphology={
      bodyLenToHeight: clamp(+((1.45 + (seed%13)/100).toFixed(2)),1.1,2.1),
      bellyDepthRatio: clamp(+((0.50 + ((seed>>3)%15)/100).toFixed(2)),0.35,0.9),
      hockAngleDeg: clamp(135 + ((seed>>5)%21),120,170),
      toplineDeviation: clamp(+((0.04 + ((seed>>7)%10)/100).toFixed(2)),0,0.3),
      rumpSlope: clamp(+((0.02 + ((seed>>9)%12)/100).toFixed(2)), -0.1, 0.3)
    };

    // BCS aproximado 1–5 a partir de morfología
    let bcs = 3.0;
    if(morphology.bellyDepthRatio<0.48) bcs-=0.6;
    if(morphology.bellyDepthRatio>0.66) bcs-=0.3;
    if(morphology.toplineDeviation>0.16) bcs-=0.6;
    if(morphology.toplineDeviation<0.06) bcs+=0.2;
    if(morphology.hockAngleDeg<130) bcs-=0.2;
    bcs = clamp(+bcs.toFixed(1),1,5);
    const bcs9 = +(2*bcs-1).toFixed(1);

    // Score global
    let score = 60;
    score += Math.max(0, (1 - Math.abs(morphology.bodyLenToHeight-1.6)/0.4))*20;
    score += Math.max(0, (1 - Math.abs(morphology.bellyDepthRatio-0.58)/0.18))*10;
    score += Math.max(0, (1 - Math.abs(morphology.hockAngleDeg-145)/25))*10;
    score -= Math.max(0, (morphology.toplineDeviation-0.12))*80;
    score = clamp(Math.round(score),0,100);
    const verdictBand = score>=80?'Excelente': score>=70?'Bueno': score>=58?'Regular':'Malo';

    const grades=metricGrades(morphology);

    // Fortalezas/Debilidades robustas
    const strengths=[], weaknesses=[];
    if(morphology.toplineDeviation<=0.08) strengths.push('Línea dorsal recta/estable');
    if(morphology.hockAngleDeg>=140) strengths.push('Ángulo de corvejón funcional');
    if(morphology.bellyDepthRatio>=0.50 && morphology.bellyDepthRatio<=0.70) strengths.push('Capacidad ruminal adecuada');
    if(morphology.bodyLenToHeight>=1.5) strengths.push('Buena longitud corporal para rendimiento cárnico');
    if(morphology.hockAngleDeg<130) weaknesses.push('Corvejón cerrado (riesgo locomotor)');
    if(morphology.toplineDeviation>0.18) weaknesses.push('Dorso cóncavo (menor eficiencia)');
    if(morphology.bellyDepthRatio>0.75) weaknesses.push('Abdomen muy profundo (posible baja conversión)');

    const explanation = 'Estructura y condición ' + (verdictBand==='Malo'?'limitantes':'adecuadas') + ' para engorde. '
      + 'BCS estimado ' + bcs.toFixed(1) + ' (escala 1–5); corvejón ~' + morphology.hockAngleDeg + '°; línea dorsal '
      + (morphology.toplineDeviation<=0.08?'estable':'con desviación moderada') + '.';

    res.status(200).end(JSON.stringify({
      source: process.env.OPENAI_API_KEY?'openai':'heuristic',
      morphology, bcs, bcs9, score, verdictBand, metricGrades:grades,
      strengths, weaknesses, explanation,
      sex:null, categoryGuess:null, ageGuessMonths:null, weightGuessKg:null
    }));
  }catch(e){
    res.status(500).end(JSON.stringify({error:'API error', detail:String(e)}));
  }
};
module.exports.config={runtime:'nodejs'};
