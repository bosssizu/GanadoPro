module.exports = (req, res) => {
  res.status(200).json({
    hasKey: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    env: process.env.VERCEL_ENV || null
  });
};
