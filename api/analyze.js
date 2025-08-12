// Fixed: use 'image_url' (not 'input_image') for Chat Completions vision
// Also sets detail:'low' to control cost.
function heuristicAnalyze() {
  return {
    source: "heuristic",
    morphology: {
      bodyLenToHeight: 1.55,
      bellyDepthRatio: 0.58,
      hockAngleDeg: 142,
      rumpSlope: 0.07,
      toplineDeviation: 0.06
    },
    bcs: 3.2,
    breedGuess: [
      {breed:"Brahman / Cebú", pct: 40},
      {breed:"Cruce doble propósito", pct: 35},
      {breed:"Lechera europea", pct: 25}
    ],
    healthFlags: []
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
    const { imageDataUrl } = body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") return res.status(400).json({ error: "Missing imageDataUrl" });

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    if (!apiKey) return res.status(200).json(heuristicAnalyze());

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
  "healthFlags": [string]
}`;

    const userText = "Analiza la morfología bovina (vista lateral). Estima las métricas y el BCS (1-5).";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } }
            ]
          }
        ],
        temperature: 0.2
      })
    });

    const txt = await resp.text();
    if (!resp.ok) {
      let j = null; try { j = JSON.parse(txt); } catch {}
      const code = j?.error?.code || "";
      if (resp.status === 429 || code === "insufficient_quota") {
        return res.status(200).json({ note: "OpenAI sin cupo; usando heurística.", ...heuristicAnalyze(), source: "heuristic" });
      }
      return res.status(resp.status).json({ error: "OpenAI error", detail: txt });
    }

    let data;
    try { data = JSON.parse(txt); } catch { return res.status(500).json({ error: "OpenAI parse error", detail: txt }); }
    const content = data?.choices?.[0]?.message?.content?.trim() || "";

    try {
      const parsed = JSON.parse(content);
      return res.status(200).json({ source: "openai", ...parsed });
    } catch {
      return res.status(200).json({ source: "openai", raw: content, note: "Respuesta no JSON, devolviendo texto bruto." });
    }
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
};
