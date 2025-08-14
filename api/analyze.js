function setJSON(res){ try{res.setHeader('Content-Type','application/json; charset=utf-8');}catch{} }
function setCORS(res){ try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}catch{} }
function clamp(n,a,b){return Math.min(b,Math.max(a,n));} function num(x){const n=Number(x);return Number.isFinite(n)?n:NaN;}

function estimateBCS5({bellyDepthRatio,toplineDeviation,rumpSlope,hockAngleDeg}){
  let base=3.0;
  if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.42) base-=0.8; else if(bellyDepthRatio<0.50) base-=0.4; else if(bellyDepthRatio<=0.65) base+=0.2; else if(bellyDepthRatio>0.70) base-=0.3; }
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.18) base-=0.9; else if(toplineDeviation>0.12) base-=0.6; else if(toplineDeviation<0.05) base+=0.2; }
  if(Number.isFinite(rumpSlope)&&rumpSlope>0.15) base-=0.2;
  if(Number.isFinite(hockAngleDeg)&&hockAngleDeg<125) base-=0.2;
  return clamp(+base.toFixed(1),1,5);
}
function toESArray(arr){ if(!Array.isArray(arr)) return []; return arr.map(s=>String(s)
 .replace(/good body length/ig,'Buen largo corporal')
 .replace(/balanced belly depth/ig,'Profundidad abdominal equilibrada')
 .replace(/moderate hock angle/ig,'Ángulo de corvejón moderado')
 .replace(/slight topline deviation/ig,'Ligera desviación de línea dorsal')
 .replace(/healthy appearance/ig,'Apariencia saludable')
); }
function toES(text){ if(!text) return ''; return String(text)
 .replace(/^The animal shows/,'El animal presenta')
 .replace(/good overall health/,'buena condición general')
 .replace(/good balance in body length and height/,'buen equilibrio entre longitud corporal y alzada')
 .replace(/However, the hock angle could be improved for better mobility\\./,'Sin embargo, el ángulo de corvejón podría mejorar para una mejor movilidad.'); }

async function openaiJSON(key,model,messages){
  const controller=new AbortController(); const to=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json','Authorization':`Bearer ${key}`},
      body:JSON.stringify({model,temperature:0.1,response_format:{type:'json_object'},messages}),
      signal:controller.signal
    });
    const text=await r.text();
    if(!r.ok) throw new Error('OpenAI '+r.status+': '+text.slice(0,240));
    const data=JSON.parse(text);
    const out=JSON.parse(data?.choices?.[0]?.message?.content||"{}");
    if(!out||typeof out!=='object') throw new Error('OpenAI vacío');
    return out;
  } finally { clearTimeout(to); }
}

module.exports=async(req,res)=>{
  setCORS(res); setJSON(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    if(req.method!=='POST') return res.status(405).end(JSON.stringify({error:'Use POST {imageDataUrl}'}));
    let body=req.body; if(typeof body==='string'){ try{ body=JSON.parse(body||'{}'); }catch{ body={}; } }
    const imageDataUrl=body?.imageDataUrl; if(!imageDataUrl) return res.status(400).end(JSON.stringify({error:'Missing imageDataUrl'}));

    const key=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL||'gpt-4o-mini';

    const sys=`Eres evaluador morfológico de bovinos cebuinos (Brahman y cruces) para ENGORDE.
Responde SIEMPRE en ESPAÑOL neutro y devuelve SOLO JSON válido. No inventes si algo no se ve claro; usa null.
Estructura obligatoria:
{ "bcs9":n|null,"bcs5":n|null,"sex":"macho"|"hembra"|null,"categoryGuess":"ternero"|"novillo"|"toro"|"vaquilla"|"vaca"|null,"ageGuessMonths":n|null,"weightGuessKg":n|null,"morphology":{"bodyLenToHeight":n|null,"bellyDepthRatio":n|null,"hockAngleDeg":n|null,"toplineDeviation":n|null,"rumpSlope":n|null},"strengths":[], "weaknesses":[], "explanation":"" }`;
    const user={type:'text',text:`Analiza la imagen y devuelve SOLO JSON (en español).
Valores típicos: bodyLenToHeight 1.4–1.8; bellyDepthRatio 0.45–0.70; hockAngleDeg 130–160; toplineDeviation 0.00–0.20; rumpSlope -0.10–0.25`};
    const content=[user,{type:'image_url',image_url:{url:imageDataUrl,detail:'high'}}];

    // Safe demo si no hay API KEY
    const safeDemo=()=>{
      const morphology={bodyLenToHeight:1.60,bellyDepthRatio:0.58,hockAngleDeg:145,rumpSlope:0.08,toplineDeviation:0.08};
      let bcs5=3.6; const bcs9=+(2*bcs5-1).toFixed(1);
      const score=84,verdictBand='Bueno';
      return {source:'heuristic',morphology,bcs:+bcs5.toFixed(1),bcs9,score,verdictBand,strengths:['Línea dorsal estable','Ángulo de corvejón funcional'],weaknesses:[],explanation:'Estructura correcta para engorde.'};
    };
    if(!key){ return res.status(200).end(JSON.stringify(safeDemo())); }

    let out=await openaiJSON(key,model,[{role:'system',content:sys},{role:'user',content:content}]);

    const m=out.morphology||{};
    const morph={
      bodyLenToHeight: clamp(num(m.bodyLenToHeight)||1.60,1.05,2.30),
      bellyDepthRatio: clamp((num(m.bellyDepthRatio)>1 && num(m.bellyDepthRatio)<=100)? num(m.bellyDepthRatio)/100 : (num(m.bellyDepthRatio)||0.56),0.25,1.05),
      hockAngleDeg: clamp(num(m.hockAngleDeg)||145,110,180),
      rumpSlope: (function(){ const v=num(m.rumpSlope); if(Number.isFinite(v)){ const vv=(Math.abs(v)>1 && Math.abs(v)<=40)? v/100 : v; return clamp(vv,-0.35,0.35);} return 0.08; })(),
      toplineDeviation: clamp((num(m.toplineDeviation)>1 && num(m.toplineDeviation)<=60)? num(m.toplineDeviation)/100 : (num(m.toplineDeviation)||0.08),0,0.6)
    };

    let bcs5=num(out.bcs5), bcs9=num(out.bcs9);
    if(!Number.isFinite(bcs5) && Number.isFinite(bcs9)) bcs5=0.5*bcs9+0.5;
    if(!Number.isFinite(bcs9) && Number.isFinite(bcs5)) bcs9=2*bcs5-1;
    if(!Number.isFinite(bcs5)) bcs5=estimateBCS5(morph);

    // calibración "flaco sano" cebuino
    const okTop=(morph.toplineDeviation??0.08)<=0.10, okHock=(morph.hockAngleDeg??145)>=135, okBelly=(morph.bellyDepthRatio??0.56)>=0.48 && (morph.bellyDepthRatio??0.56)<=0.70;
    if((bcs9??(2*bcs5-1))<=4.5 && okTop && okHock && okBelly){ bcs9=Math.max(5.2, Math.min(6.2, (bcs9??(2*bcs5-1))+1.5)); }
    if(!Number.isFinite(bcs9)) bcs9=+(2*bcs5-1).toFixed(1);
    bcs5=+(0.5*bcs9+0.5).toFixed(1);

    // Score
    const sProp=1 - Math.min(1, Math.abs((morph.bodyLenToHeight ?? 1.6) - 1.6) / 0.5);
    const sTop =1 - Math.min(1, (morph.toplineDeviation ?? 0) / 0.22);
    const sHock=1 - Math.min(1, Math.abs((morph.hockAngleDeg ?? 145) - 145) / 30);
    const sBCS =Math.min(1, Math.max(0, (bcs9 - 3) / 6));
    const score=Math.round(100*(0.34*sProp + 0.28*sTop + 0.20*sHock + 0.18*sBCS));
    const verdictBand= score>=90? 'Excelente' : score>=72? 'Bueno' : score>=58? 'Regular' : score>=45? 'Malo' : 'Muy malo';

    // Compra / no compra
    const critical = (morph.hockAngleDeg??999)<125 || (morph.toplineDeviation??0)>0.22 || (bcs5??3)<1.8;
    let decision='COMPRAR', note='—';
    if(['muy malo','malo'].some(t=>verdictBand.toLowerCase().includes(t))||critical){ decision='NO COMPRAR'; note='Estructura/condición no apta para engorde eficiente.'; }
    else if(verdictBand.toLowerCase().includes('regular')){ decision='COMPRAR (conservador)'; note='Oferta en tramo bajo del rango.'; }
    else if(verdictBand.toLowerCase().includes('bueno')){ decision='COMPRAR'; note='Puede pagarse levemente sobre promedio.'; }
    else if(verdictBand.toLowerCase().includes('excelente')){ decision='COMPRAR'; note='Rango alto sin llegar al tope.'; }

    const strengths=toESArray(out.strengths||[]);
    const weaknesses=toESArray(out.weaknesses||[]);
    const explanation=toES(out.explanation||'Estructura y condición adecuadas para engorde.');

    const payload={
      source:'openai',
      morphology:morph,
      bcs:+clamp(+bcs5.toFixed(1),1,5),
      bcs9:+clamp(+bcs9.toFixed(1),1,9),
      sex: out.sex || null,
      categoryGuess: out.categoryGuess || null,
      ageGuessMonths: out.ageGuessMonths || null,
      weightGuessKg: out.weightGuessKg || null,
      strengths, weaknesses, explanation,
      score:Math.max(0,Math.min(100,score)),
      verdictBand,
      decision, note
    };
    return res.status(200).end(JSON.stringify(payload));
  }catch(err){
    const msg=(err&&err.message)?err.message:String(err);
    return res.status(500).end(JSON.stringify({error:'API error',detail:msg}));
  }
};
module.exports.config={runtime:'nodejs'};
