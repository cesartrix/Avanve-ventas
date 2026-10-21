// Zonas dibujadas en el mapa (pestaña Mapa del tablero), una por ruta de venta.
// Se guardan en GitHub como data/zonas.json:
//   { "43": { "geometry": {GeoJSON Polygon|MultiPolygon}, "actualizado": "AAAA-MM-DDTHH:MM:SS" }, ... }
// GET               -> devuelve el JSON completo ({} si todavía no hay nada)
// POST ?pwd=...     body { ruta: "43", geometry: {...} }  -> guarda la zona de esa ruta
//                   body { ruta: "43", geometry: null }   -> borra la zona de esa ruta

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const FILE_PATH      = 'data/zonas.json';

const GH = (path, init = {}) => fetch(`https://api.github.com/repos/${GITHUB_REPO}/${path}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  },
});

async function leer() {
  const r = await GH(`contents/${FILE_PATH}`);
  if (r.status === 404) return { data: {}, sha: null };
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const d = await r.json();
  const txt = Buffer.from(d.content || '', 'base64').toString('utf8');
  return { data: txt.trim() ? JSON.parse(txt) : {}, sha: d.sha };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

const isPos = p => Array.isArray(p) && p.length >= 2 && p.every(n => typeof n === 'number' && isFinite(n))
  && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const isRing = r => Array.isArray(r) && r.length >= 4 && r.length <= 5000 && r.every(isPos);
const isPoly = p => Array.isArray(p) && p.length >= 1 && p.length <= 50 && p.every(isRing);
function geometriaValida(g) {
  if (!g || typeof g !== 'object') return false;
  if (g.type === 'Polygon') return isPoly(g.coordinates);
  if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) && g.coordinates.length >= 1
    && g.coordinates.length <= 50 && g.coordinates.every(isPoly);
  return false;
}

function ahoraAR() {
  // Hora Argentina (UTC-3), formato AAAA-MM-DDTHH:MM:SS
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data } = await leer();
      return res.status(200).json(data);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if ((req.query.pwd || '') !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const body = await readBody(req);
    const ruta = String(body.ruta ?? '').trim();
    if (!/^[\w.\- ]{1,40}$/.test(ruta)) return res.status(400).json({ error: 'Ruta inválida' });
    const borrar = body.geometry === null;
    if (!borrar && !geometriaValida(body.geometry)) return res.status(400).json({ error: 'Zona inválida' });

    const { data, sha } = await leer();
    if (borrar) delete data[ruta];
    else data[ruta] = { geometry: body.geometry, actualizado: ahoraAR() };
    const content = Buffer.from(JSON.stringify(data)).toString('base64');
    const r = await GH(`contents/${FILE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Zona ruta ${ruta}: ${borrar ? 'borrada' : 'guardada'}`, content, ...(sha ? { sha } : {}) }),
    });
    if (!r.ok) throw new Error(await r.text());
    return res.status(200).json({ ok: true, ruta, borrada: borrar, zona: data[ruta] || null });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
}
