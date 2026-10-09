// Devuelve los meses cerrados calculados desde la API de ChessERP (chess_sync.py --historico / cierre automatico).
// Archivos: data/chess_api_mensual/AAAA-MM.json
// GET /api/chess-mensual -> { "2026-09": {...}, "2026-10": {...} }  ({} si todavia no hay ninguno)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const DIR          = 'data/chess_api_mensual';

const gh = (path, accept) => fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
  headers: {
    Accept: accept || 'application/vnd.github+json',
    ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  },
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await gh(DIR);
    if (r.status === 404) return res.status(200).json({});
    if (!r.ok) return res.status(500).json({ error: 'Error GitHub: ' + r.status });
    const files = (await r.json()).filter(f => f.type === 'file' && /^\d{4}-\d{2}\.json$/.test(f.name));
    const out = {};
    await Promise.all(files.map(async f => {
      const fr = await gh(`${DIR}/${f.name}`, 'application/vnd.github.raw');
      if (fr.ok) {
        try { out[f.name.slice(0, 7)] = JSON.parse(await fr.text()); } catch (_) {}
      }
    }));
    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
