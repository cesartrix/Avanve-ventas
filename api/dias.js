// Días de trabajo por mes, configurados desde admin.html.
// Se guardan en GitHub como data/dias_trabajo.json:
//   { "2026-10": ["2026-10-01","2026-10-02", ...], "2026-11": [...] }
// GET               -> devuelve el JSON completo ({} si todavía no hay nada)
// POST ?pwd=...     body { mes: "AAAA-MM", dias: ["AAAA-MM-DD", ...] } -> guarda ese mes

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const FILE_PATH      = 'data/dias_trabajo.json';

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
    const mes = String(body.mes || '');
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mes inválido (AAAA-MM)' });
    const dias = Array.isArray(body.dias) ? body.dias : null;
    if (!dias || !dias.every(d => typeof d === 'string' && d.startsWith(mes + '-') && /^\d{4}-\d{2}-\d{2}$/.test(d)))
      return res.status(400).json({ error: 'Lista de días inválida' });

    const { data, sha } = await leer();
    data[mes] = [...new Set(dias)].sort();
    const content = Buffer.from(JSON.stringify(data, null, 1)).toString('base64');
    const r = await GH(`contents/${FILE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Días de trabajo ${mes}: ${data[mes].length}`, content, ...(sha ? { sha } : {}) }),
    });
    if (!r.ok) throw new Error(await r.text());
    return res.status(200).json({ ok: true, mes, total: data[mes].length });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
}
