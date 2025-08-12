// /api/analyze.js — OpenAI Vision (gpt-4o-mini by default) with sanitization & diseaseFindings
function clamp(n,min,max){ return Math.min(max, Math.max(min,n)); }
function toNum(x){ const n = Number(x); return Number.isFinite(n)?n:NaN; }

function sanitizeMetrics(m){
  let bodyLenToHeight = toNum(m?.bodyLenToHeight);
  let bellyDepthRatio = toNum(m?.bellyDepthRatio);
  let hockAngleDeg = toNum(m?.hockAngleDeg);
  let rumpSlope = toNum(m?.rumpSlope);
  let toplineDeviation = toNum(m?.toplineDeviation);
  if(!Number.isFinite(bodyLenToHeight)) bodyLenToHeight=1.55;
  bodyLenToHeight = clamp(bodyLenToHeight,1.1,2.2);
  if(!Number.isFinite(bellyDepthRatio)) bellyDepthRatio=0.58;
  if(bellyDepthRatio>1 && bellyDepthRatio<=100) bellyDepthRatio/=100;
  bellyDepthRatio = clamp(bellyDepthRatio,0.3,0.95);
  if(!Number.isFinite(hockAngleDeg)) hockAngleDeg=145;
  hockAngleDeg = clamp(hockAngleDeg,120,170);
  if(Number.isFinite(rumpSlope)){ if(Math.abs(rumpSlope)>1 && Math.abs(rumpSlope)<=30) rumpSlope/=100; } else rumpSlope=0.06;
  rumpSlope = clamp(rumpSlope,-0.25,0.25);
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>1 && toplineDeviation<=50) toplineDeviation/=100; } else toplineDeviation=0.06;
  toplineDeviation = clamp(toplineDeviation,0,0.5);
  return { bodyLenToHeight, bellyDepthRatio, hockAngleDeg, rumpSlope, toplineDeviation };
}

function estimateBCS({bellyDepthRatio,toplineDeviation,rumpSlope}){
  let base=3;
  if(Number.isFinite(bellyDepthRatio)){ if(bellyDepthRatio<0.45) base-=0.7; else if(bellyDepthRatio>0.65) base+=0.7; }
  if(Number.isFinite(toplineDeviation)){ if(toplineDeviation>0.10) base-=0.6; if(toplineDeviation<0.04) base+=0.2; }
  if(Number.isFinite(rumpSlope) && rumpSlope>0.1) base-=0.2;
  return Math.max(1, Math.min(5, Number(base.toFixed(1))));
}

function computeFlags({hockAngleDeg,toplineDeviation,rumpSlope}){
  const flags=[];
  if(Number.isFinite(hockAngleDeg)){ if(hockAngleDeg<135) flags.push("hock_angle_closed"); else if(hockAngleDeg<145) flags.push("hock_angle_watch"); }
  if(Number.isFinite(toplineDeviation) && toplineDeviation>0.12) flags.push("topline_curved");
  if(Number.isFinite(rumpSlope) && rumpSlope>0.12) flags.push("steep_rump");
  return flags;
}

function heuristicAnalyze(){
  const morphology={ bodyLenToHeight:1.55, bellyDepthRatio:0.58, hockAngleDeg:142, rumpSlope:0.07, toplineDeviation:0.06 };
  const bcs=estimateBCS(morphology); const healthFlags=computeFlags(morphology);
  return { source:"heuristic", morphology, bcs, breedGuess:[{breed:"Brahman / Cebú", pct:40},{breed:"Cruce doble propósito", pct:35},{breed:"Lechera europea", pct:25}], healthFlags, diseaseFindings:[] };
}

module.exports = async function handler(req, res){
  try{
    if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
    let body=req.body; if(typeof body==="string"){ try{ body=JSON.parse(body||"{}"); }catch{ body={} } }
    const { imageDataUrl } = body || {};
    if(!imageDataUrl || typeof imageDataUrl!=="string") return res.status(400).json({error:"Missing imageDataUrl"});

    const apiKey=process.env.OPENAI_API_KEY;
    const model=process.env.OPENAI_MODEL || "gpt-4o-mini";
    if(!apiKey) return res.status(200).json(heuristicAnalyze());

    const sys = `Eres un evaluador morfológico bovino. Devuelve solo JSON válido con:
{
  "morphology": {
    "bodyLenToHeight": number,
    "bellyDepthRatio": number,
    "hockAngleDeg": number,
    "rumpSlope": number,
    "toplineDeviation": number
  },
  "bcs": number,
  "breedGuess": [{"breed": string, "pct": number}],
  "healthFlags": [string],
  "diseaseFindings": [string]
}`;

    const userText = "Analiza morfología bovina (vista lateral). Estima métricas y BCS (1-5). Reporta posibles enfermedades visibles si las hay.";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "content-type":"application/json", "authorization":`Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages:[
          { role:"system", content: sys },
          { role:"user", content: [ {type:"text", text:userText}, {type:"image_url", image_url:{ url:imageDataUrl, detail:"low" }} ] }
        ],
        temperature:0.2
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
    let modelOut=null; try{ modelOut=JSON.parse(content); }catch{}

    const morph = sanitizeMetrics(modelOut?.morphology||{});
    let bcs = toNum(modelOut?.bcs); if(!Number.isFinite(bcs)||bcs<1||bcs>5) bcs=estimateBCS(morph);
    const flagsModel = Array.isArray(modelOut?.healthFlags)? modelOut.healthFlags : [];
    const flagsAuto = computeFlags(morph);
    const healthFlags = Array.from(new Set([...flagsModel, ...flagsAuto]));
    const diseaseFindings = Array.isArray(modelOut?.diseaseFindings)? modelOut.diseaseFindings : [];
    const breedGuess = Array.isArray(modelOut?.breedGuess)&&modelOut.breedGuess.length? modelOut.breedGuess : [{breed:"Desconocida", pct:100}];

    return res.status(200).json({ source:"openai", morphology:morph, bcs, breedGuess, healthFlags, diseaseFindings });
  }catch(err){
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
