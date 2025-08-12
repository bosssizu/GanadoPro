// /api/ocr-prices.js — Extract rows from auction price images via OpenAI Vision
module.exports = async function handler(req, res){
  try{
    if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
    let body=req.body; if(typeof body==="string"){ try{ body=JSON.parse(body||"{}"); }catch{ body={} } }
    const { images } = body || {};
    if(!Array.isArray(images) || !images.length) return res.status(400).json({error:"Missing images[]"});
    const apiKey=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL || "gpt-4o-mini";
    if(!apiKey) return res.status(200).json({ rows:[], note:"Sin OPENAI_API_KEY, no OCR." });

    const sys = `Eres un asistente de extracción de datos. Devuelve SOLO JSON válido:
{ "rows": [ { "date": "YYYY-MM-DD", "category": string, "sex": "macho|hembra", "age_months": number, "weight_kg": number, "price_total_crc": number, "location": string } ... ] }`;

    const userText = "Extrae registros de subasta (fecha, categoría, sexo, edad en meses si aparece, peso kg, precio total CRC y ubicación).";

    const contents = [{ type:"text", text:userText }, ... images.map(url=> ({ type:"image_url", image_url:{ url, detail:"low" } }))];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{ "content-type":"application/json", "authorization":`Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages:[ {role:"system", content:sys}, {role:"user", content:contents} ], temperature:0 })
    });

    const txt = await resp.text();
    if(!resp.ok) return res.status(resp.status).json({error:"OpenAI error", detail:txt});
    let data; try{ data=JSON.parse(txt); }catch{ return res.status(500).json({error:"OpenAI parse error", detail:txt}); }
    const content = data?.choices?.[0]?.message?.content?.trim() || "";
    let out=null; try{ out=JSON.parse(content); }catch{ out=null; }
    const rows = Array.isArray(out?.rows)? out.rows : [];
    const norm = (v)=> { const n=Number(String(v).replace(/[^0-9.\-]/g,"")); return Number.isFinite(n)?n:NaN; };
    const rowsN = rows.map(r=> ({
      date: r.date || null,
      category: (r.category||"").toLowerCase(),
      sex: (r.sex||"").toLowerCase(),
      age_months: norm(r.age_months),
      weight_kg: norm(r.weight_kg),
      price_total_crc: norm(r.price_total_crc),
      location: r.location || null,
      price_per_kg: (norm(r.price_total_crc) && norm(r.weight_kg)) ? (norm(r.price_total_crc)/norm(r.weight_kg)) : null
    }));
    return res.status(200).json({ rows: rowsN.filter(r=>r.price_per_kg && r.weight_kg) });
  }catch(err){
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
