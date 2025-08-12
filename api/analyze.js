// /api/analyze.js — v2 estricta: pide más señales (cuernos, emaciación, cojera) y aplica guardrails de veredicto.
function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
function num(x){ const n = Number(x); return Number.isFinite(n)?n:NaN; }

function sanitizeMetrics(m){
  let bodyLenToHeight = num(m?.bodyLenToHeight);
  let bellyDepthRatio = num(m?.bellyDepthRatio);
  let hockAngleDeg = num(m?.hockAngleDeg);
  let rumpSlope = num(m?.rumpSlope);
  let toplineDeviation = num(m?.toplineDeviation);
  if(!Number.isFinite(bodyLenToHeight)) bodyLenToHeight=1.55;
  bodyLenToHeight = clamp(bodyLenToHeight,1.05,2.3);
  if(!Number.isFinite(bellyDepthRatio)) bellyDepthRatio=0.58;
  if(bellyDepthRatio>1 && bellyDepthRatio<=100) bellyDepthRatio/=100;
  bellyDepthRatio = clamp(bellyDepthRatio,0.25,1.05);
  if(!Number.isFinite(hockAngleDeg)) hockAngleDeg=145;
  hockAngleDeg = clamp(hockAngleDeg,110,180);
  if(Number.isFinite(rumpSlope)){ if(Math.abs(rumpSlope)>1 && Math.abs(rumpSlope)<=40) rumpSlope/=100; } else rumpSlope=0.06;
  rumpSlope = clamp(rumpSlope,-0.35,0.35);
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>1 && toplineDeviation<=60) toplineDeviation/=100; } else toplineDeviation=0.06;
  toplineDeviation = clamp(toplineDeviation,0,0.6);
  return { bodyLenToHeight, bellyDepthRatio, hockAngleDeg, rumpSlope, toplineDeviation };
}

function estimateBCS({ bellyDepthRatio, toplineDeviation, rumpSlope }){
  let base = 3;
  if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.45) base-=0.9; else if(bellyDepthRatio>0.65) base+=0.7; }
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.12) base-=0.6; if(toplineDeviation<0.04) base+=0.2; }
  if(Number.isFinite(rumpSlope) && rumpSlope>0.12) base-=0.2;
  return Math.max(1, Math.min(5, Number(base.toFixed(1))));
}

function flagsFromMetrics({hockAngleDeg,toplineDeviation,rumpSlope}, bcs){
  const flags=[];
  if(Number.isFinite(hockAngleDeg)){ if(hockAngleDeg<135) flags.push("hock_angle_closed"); else if(hockAngleDeg<145) flags.push("hock_angle_watch"); }
  if(Number.isFinite(toplineDeviation) && toplineDeviation>0.12) flags.push("topline_curved");
  if(Number.isFinite(rumpSlope) && rumpSlope>0.15) flags.push("steep_rump");
  if(Number.isFinite(bcs) && bcs<2.2) flags.push("underweight");
  return flags;
}

function scoreFattening({ metrics, bcs, sex, ageMonths, category }){
  let score=0, totalW=0;
  if(Number.isFinite(bcs)){ const dist=Math.abs(bcs-3.0); let s=100-clamp(dist*50,0,100); const w=0.34; score+=s*w; totalW+=w; }
  if(Number.isFinite(metrics?.bodyLenToHeight)){ let s=100-Math.abs(metrics.bodyLenToHeight-1.65)*200; s=clamp(s,0,100); const w=0.18; score+=s*w; totalW+=w; }
  if(Number.isFinite(metrics?.hockAngleDeg)){ let s=100-Math.abs(metrics.hockAngleDeg-145)*6; s=clamp(s,0,100); const w=0.18; score+=s*w; totalW+=w; }
  if(Number.isFinite(metrics?.toplineDeviation)){ let s=100-clamp((metrics.toplineDeviation-0.08),0,0.5)*(100/0.5); s=clamp(s,0,100); const w=0.16; score+=s*w; totalW+=w; }
  if(Number.isFinite(metrics?.rumpSlope)){ let x=Math.abs(metrics.rumpSlope); let s=100-clamp(Math.max(0,x-0.12),0,0.35)*(100/0.35); s=clamp(s,0,100); const w=0.08; score+=s*w; totalW+=w; }
  if(Number.isFinite(ageMonths)){ let adj=1; if(category==='novillo'){ if(ageMonths<8||ageMonths>30) adj=0.9; } else if(category==='ternero'){ adj=0.85; } else if(category==='vaquilla'||category==='vaca_descarte'){ adj=0.88; } else if(category==='toro'){ adj=0.82; } const w=0.06; score+=100*adj*w; totalW+=w; }
  return clamp(Math.round(score/totalW),0,100);
}
const BAND_ORDER = ["Muy malo","Malo","Regular","Bueno","Excelente"];
function bandFromScore(score){ if(score>=90) return "Excelente"; if(score>=72) return "Bueno"; if(score>=58) return "Regular"; if(score>=45) return "Malo"; return "Muy malo"; }
function minBand(a,b){ return BAND_ORDER[Math.min(BAND_ORDER.indexOf(a), BAND_ORDER.indexOf(b))]; }

function guardBand({ bcs, emaciation, healthFlags, diseaseFindings, category, sex, ageMonths }){
  let cap = "Excelente";
  if(Number.isFinite(bcs) && bcs < 2.2) cap = minBand(cap, "Muy malo");
  else if(Number.isFinite(bcs) && bcs < 2.6) cap = minBand(cap, "Malo");
  if(emaciation === true) cap = minBand(cap, "Muy malo");
  const risky = ["cojera","claudicación","tos","descarga nasal","diarrea","herida","bloat","timpanismo"];
  if(Array.isArray(diseaseFindings) && diseaseFindings.some(x => typeof x === 'string' && risky.some(rx => x.toLowerCase().includes(rx)))) cap = minBand(cap, "Malo");
  if(Array.isArray(healthFlags) && healthFlags.includes("hock_angle_closed")) cap = minBand(cap, "Malo");
  if(category === "toro" && Number.isFinite(ageMonths) && ageMonths > 30) cap = minBand(cap, "Regular");
  return cap;
}

function reasons({metrics,bcs,sex,category,ageMonths,healthFlags,diseaseFindings,emaciation}){
  const out=[];
  if(Number.isFinite(bcs)){ if(bcs<2.2) out.push(`BCS muy bajo (${bcs.toFixed(1)}) → NO apto hasta recuperar`);
    else if(bcs<2.6) out.push(`BCS bajo (${bcs.toFixed(1)})`);
    else if(bcs>3.8) out.push(`BCS alto (${bcs.toFixed(1)}) → controlar energía`);
    else out.push(`BCS adecuado (${bcs.toFixed(1)})`); }
  if(Number.isFinite(metrics?.bodyLenToHeight)){ if(metrics.bodyLenToHeight>=1.55) out.push(`Largo corporal favorable (L/A ${metrics.bodyLenToHeight.toFixed(2)})`); else out.push(`Largo/Alzada moderado (L/A ${metrics.bodyLenToHeight.toFixed(2)})`); }
  if(Number.isFinite(metrics?.hockAngleDeg)){ if(metrics.hockAngleDeg<135) out.push(`Corvejón cerrado (${Math.round(metrics.hockAngleDeg)}°)`); else if(metrics.hockAngleDeg>155) out.push(`Corvejón abierto (${Math.round(metrics.hockAngleDeg)}°)`); else out.push(`Ángulo de corvejón aceptable (~${Math.round(metrics.hockAngleDeg)}°)`); }
  if(Number.isFinite(metrics?.toplineDeviation)){ if(metrics.toplineDeviation>0.12) out.push(`Dorso curvado (desv. ${metrics.toplineDeviation.toFixed(2)})`); else out.push(`Línea superior adecuada (desv. ${metrics.toplineDeviation.toFixed(2)})`); }
  if(emaciation===true) out.push('Emaciación visible');
  if(Array.isArray(healthFlags) && healthFlags.length) out.push(`Banderas: ${healthFlags.join(', ')}`);
  if(Array.isArray(diseaseFindings) && diseaseFindings.length) out.push(`Hallazgos: ${diseaseFindings.join('; ')}`);
  if(category) out.push(`Categoría: ${category}${Number.isFinite(ageMonths)?' · '+ageMonths+'m':''}${sex? ' · '+sex : ''}`);
  return out;
}

function heuristicAnalyze(){
  const morphology={ bodyLenToHeight:1.55, bellyDepthRatio:0.58, hockAngleDeg:142, rumpSlope:0.07, toplineDeviation:0.06 };
  const bcs=estimateBCS(morphology);
  const healthFlags=flagsFromMetrics(morphology,bcs);
  const sex="macho", categoryGuess="novillo", ageGuessMonths=18, weightGuessKg=320, emaciation=false, hornsPresent=true, gaitConcern=false;
  const score=scoreFattening({metrics:morphology,bcs,sex,ageMonths:ageGuessMonths,category:categoryGuess});
  const band=bandFromScore(score); const cap=guardBand({bcs,emaciation,healthFlags,diseaseFindings:[],category:categoryGuess,sex,ageMonths:ageGuessMonths});
  const finalBand=minBand(band,cap); const verdictReasons=reasons({metrics:morphology,bcs,sex,category:categoryGuess,ageMonths:ageGuessMonths,healthFlags,diseaseFindings:[],emaciation});
  return { source:"heuristic", morphology, bcs, breedGuess:[{breed:"Brahman / Cebú", pct:40}], healthFlags, diseaseFindings:[], sex, categoryGuess, ageGuessMonths, weightGuessKg, score, verdictBand:finalBand, verdictReasons, hornsPresent, emaciation, gaitConcern };
}

module.exports = async function handler(req, res){
  try{
    if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
    let body=req.body; if(typeof body==="string"){ try{ body=JSON.parse(body||"{}"); }catch{ body={} } }
    const { imageDataUrl } = body || {};
    if(!imageDataUrl || typeof imageDataUrl!=="string") return res.status(400).json({error:"Missing imageDataUrl"});

    const apiKey=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL || "gpt-4o-mini";
    if(!apiKey) return res.status(200).json(heuristicAnalyze());

    const sys = `Eres un evaluador bovino profesional. Devuelve SOLO JSON estrictamente válido con:
{
  "morphology": { "bodyLenToHeight": number, "bellyDepthRatio": number, "hockAngleDeg": number, "rumpSlope": number, "toplineDeviation": number },
  "bcs": number,
  "breedGuess": [{"breed": string, "pct": number}],
  "healthFlags": [string],
  "diseaseFindings": [string],
  "sex": "macho" | "hembra" | "desconocido",
  "categoryGuess": "ternero" | "novillo" | "toro" | "vaquilla" | "vaca_descarte" | "desconocido",
  "ageGuessMonths": number | null,
  "weightGuessKg": number | null,
  "hornsPresent": boolean,
  "emaciation": boolean,
  "gaitConcern": boolean
}
Si la condición corporal es muy baja o notas emaciación/cojera, refleja eso en los campos y banderas.`;

    const userText = "Analiza morfología (vista lateral), BCS (1-5), sexo, categoría, y signos como cuernos, emaciación o cojera. Estima edad y peso si es posible. Devuelve solo el JSON pedido.";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{ "content-type":"application/json", "authorization":`Bearer ${apiKey}` },
      body: JSON.stringify({
        model, temperature:0.2,
        messages:[
          { role:"system", content: sys },
          { role:"user", content: [ {type:"text", text:userText}, {type:"image_url", image_url:{ url:imageDataUrl, detail:"low" }} ] }
        ]
      })
    });

    const txt = await resp.text();
    if(!resp.ok){
      let j=null; try{ j=JSON.parse(txt); }catch{}
      const code=j?.error?.code||"";
      if(resp.status===429 || code==="insufficient_quota"){
        return res.status(200).json({ note:"OpenAI sin cupo; heurística.", ...heuristicAnalyze(), source:"heuristic" });
      }
      return res.status(resp.status).json({ error:"OpenAI error", detail: txt });
    }

    let data; try{ data=JSON.parse(txt); }catch{ return res.status(500).json({error:"OpenAI parse error", detail:txt}); }
    const content = data?.choices?.[0]?.message?.content?.trim() || "";
    let modelOut=null; try{ modelOut=JSON.parse(content); }catch{ modelOut=null; }

    const morph = sanitizeMetrics(modelOut?.morphology||{});
    let bcs = num(modelOut?.bcs); if(!Number.isFinite(bcs)||bcs<1||bcs>5) bcs=estimateBCS(morph);
    const sex = modelOut?.sex || "desconocido";
    const categoryGuess = modelOut?.categoryGuess || "desconocido";
    const ageGuessMonths = num(modelOut?.ageGuessMonths); const ageM = Number.isFinite(ageGuessMonths)? Math.max(0,Math.round(ageGuessMonths)) : null;
    const weightGuessKg = num(modelOut?.weightGuessKg); const wKg = Number.isFinite(weightGuessKg)? Math.max(40, Math.round(weightGuessKg)) : null;
    const flagsModel = Array.isArray(modelOut?.healthFlags)? modelOut.healthFlags : [];
    const flagsAuto = flagsFromMetrics(morph,bcs);
    const healthFlags = Array.from(new Set([...flagsModel, ...flagsAuto]));
    const diseaseFindings = Array.isArray(modelOut?.diseaseFindings)? modelOut.diseaseFindings : [];
    const breedGuess = Array.isArray(modelOut?.breedGuess)&&modelOut.breedGuess.length? modelOut.breedGuess : [{breed:"Desconocida", pct:100}];
    const hornsPresent = Boolean(modelOut?.hornsPresent);
    const emaciation = Boolean(modelOut?.emaciation);
    const gaitConcern = Boolean(modelOut?.gaitConcern);

    const score = scoreFattening({ metrics:morph, bcs, sex, ageMonths:ageM, category:categoryGuess });
    const band = bandFromScore(score);
    const cap = guardBand({ bcs, emaciation, healthFlags, diseaseFindings, category:categoryGuess, sex, ageMonths:ageM });
    const finalBand = minBand(band, cap);
    const verdictReasons = reasons({metrics:morph,bcs,sex,category:categoryGuess,ageMonths:ageM,healthFlags,diseaseFindings,emaciation});

    return res.status(200).json({ source:"openai", morphology:morph, bcs, breedGuess, healthFlags, diseaseFindings, sex, categoryGuess, ageGuessMonths:ageM, weightGuessKg:wKg, score, verdictBand:finalBand, verdictReasons, hornsPresent, emaciation, gaitConcern });
  }catch(err){
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
