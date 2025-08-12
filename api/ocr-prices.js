// /api/ocr-prices.js — OCR for Costa Rica auction summary tables
module.exports = async function handler(req, res){
  try{
    if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
    let body=req.body; if(typeof body==="string"){ try{ body=JSON.parse(body||"{}"); }catch{ body={} } }
    const { images } = body || {};
    if(!Array.isArray(images) || !images.length) return res.status(400).json({error:"Missing images[]"});
    const apiKey=process.env.OPENAI_API_KEY; const model=process.env.OPENAI_MODEL || "gpt-4o-mini";
    if(!apiKey) return res.status(200).json({ rows:[], note:"Sin OPENAI_API_KEY, no OCR." });

    const sys = `Eres un extractor para resúmenes de subasta de ganado de Costa Rica.
Debes devolver SOLO JSON con esta forma:
{ "rows": [ { "category": string, "perKgAvg": number, "perKgMin": number|null, "perKgMax": number|null, "date": "YYYY-MM-DD"|null, "auction": string|null } ] }
- "category" normalizada en minúsculas (toro, novillo, ternero, vaquilla, vaca, repasto, macho criollo, bufalo, ternera, novilla).
- Los números son colones costarricenses (CRC) por kilo.
- Si hay varias páginas, agrega todas las filas encontradas.`;

    const userText = "Extrae de cada imagen la columna 'Precio promedio por kilo' y, si están, 'Precio mínimo' y 'Precio máximo' para cada 'Tipo'.";

    const contents = [{ type:"text", text:userText }, ... images.map(url=> ({ type:"image_url", image_url:{ url, detail:"low" } }))];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{ "content-type":"application/json", "authorization":`Bearer ${apiKey}` },
      body: JSON.stringify({ model, response_format:{type:"json_object"}, messages:[ {role:"system", content:sys}, {role:"user", content:contents} ], temperature:0 })
    });

    const txt = await resp.text();
    if(!resp.ok) return res.status(resp.status).json({error:"OpenAI error", detail:txt});
    let data; try{ data=JSON.parse(txt); }catch{ return res.status(500).json({error:"OpenAI parse error", detail:txt}); }
    const out = data?.choices?.[0]?.message?.content?.trim() || "{}";
    let j=null; try{ j=JSON.parse(out); }catch{ j=null; }
    const rows = Array.isArray(j?.rows)? j.rows : [];

    const normNum = (v)=> { const n=Number(String(v).replace(/[^0-9.\-]/g,"")); return Number.isFinite(n)?n:NaN; };
    const normCat = (c)=> String(c||"").toLowerCase().replace(/\s+/g,' ').trim();
    const rowsN = rows.map(r=> ({
      category: normCat(r.category),
      perKgAvg: normNum(r.perKgAvg),
      perKgMin: Number.isFinite(normNum(r.perKgMin))? normNum(r.perKgMin) : null,
      perKgMax: Number.isFinite(normNum(r.perKgMax))? normNum(r.perKgMax) : null,
      date: r.date || null, auction: r.auction || null
    })).filter(r=> Number.isFinite(r.perKgAvg));

    return res.status(200).json({ rows: rowsN });
  }catch(err){
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
