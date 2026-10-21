// Devuelve data/clientes_mapa.json (clientes con coordenadas, ruta y vendedor, generado por chess_sync.py).
// GET /api/clientes-mapa -> el JSON tal cual, o 404 si todavía no existe.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const FILE_PATH    = 'data/clientes_mapa.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
      headers: {
        Accept: 'application/vnd.github.raw',
        ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
      },
    });
    if (r.status === 404) return res.status(404).json({ error: 'Todavía no hay clientes del mapa' });
    if (!r.ok) return res.status(500).json({ error: 'Error GitHub: ' + r.status });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(await r.text());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
