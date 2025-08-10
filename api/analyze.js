export const config = {
  runtime: "nodejs18.x"
};

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
    breedGuess: [{breed:"Brahman / Cebú", pct: 40},{breed:"Cruce doble propósito", pct: 35},{breed:"Lechera europea", pct: 25}],
    healthFlags: []
  };
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({error:"Use POST"}), {status:405, headers:{"content-type":"application/json"}});
    }
    const body = await request.json();
    const { imageDataUrl } = body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing imageDataUrl" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Fallback to local heuristic if no key is configured
      return new Response(JSON.stringify(heuristicAnalyze()), { status: 200, headers: { "content-type": "application/json" } });
    }

    // Build a vision prompt asking for structured JSON
    const sys = `Eres un evaluador morfológico bovino. Devuelve solo JSON válido con:
{
  "morphology": {
    "bodyLenToHeight": number,
    "bellyDepthRatio": number,
    "hockAngleDeg": number,
    "rumpSlope": number,
    "toplineDeviation": number
  },
  "bcs": number, // 1..5
  "breedGuess": [{"breed": string, "pct": number}...],
  "healthFlags": [string]
}
No texto adicional fuera del JSON.`;

    const userText = "Analiza la morfología bovina (vista lateral). Estima las métricas solicitadas y el BCS (1-5).";

    // OpenAI Chat Completions (vision) with gpt-4o
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "input_image", image_url: { url: imageDataUrl } }
            ]
          }
        ],
        temperature: 0.2
      })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=>String(resp.status));
      return new Response(JSON.stringify({ error: "OpenAI error", detail: txt }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    // Try parse JSON; if fails, fallback to heuristic
    try {
      const parsed = JSON.parse(text);
      return new Response(JSON.stringify({ source: "openai", ...parsed }), { status: 200, headers: { "content-type":"application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ source:"openai", raw: text, note:"Respuesta no JSON, devolviendo texto bruto." }), { status: 200, headers: { "content-type":"application/json" } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
