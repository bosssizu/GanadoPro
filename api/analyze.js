
const formidable = require("formidable");
const fs = require("fs");

module.exports = (req, res) => {
  if (req.method.toLowerCase() === "options") {
    res.status(200).end();
    return;
  }

  const form = formidable({ multiples: false });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: "Error al procesar la imagen" });
      return;
    }

    // Simulación de análisis AI (en producción llamarías a OpenAI aquí)
    const resultado = {
      morphology: {
        bodyLenToHeight: 1.5,
        bellyDepthRatio: 0.4,
        hockAngleDeg: 130,
        rumpSlope: 0.2,
        toplineDeviation: 0.3
      },
      bcs: 3,
      verdict: "Regular",
      recommendation: "Comprar solo si está barato",
      priceRangeCRC: "₡1 200 – ₡1 350"
    };

    res.status(200).json(resultado);
  });
};
