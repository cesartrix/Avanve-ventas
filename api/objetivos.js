// Objetivos y horas de los vendedores por mes, cargados desde admin.html
// (el Excel se lee en el navegador y acá llega ya convertido a JSON).
// Se guardan en GitHub como data/objetivos.json:
//   { "2026-10": { subido, archivo, vendedores:[{codigo,nombre,supervisor,objetivo}],
//                  horas:[{codigo,nombre,horas}], subtotales:{SUP: objetivo}, general } }
// GET               -> devuelve el JSON completo ({} si todavía no hay nada)
// POST ?pwd=...     body { mes:"AAAA-MM", archivo, vendedores, horas, subtotales, general } -> guarda ese mes

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const FILE_PATH      = 'data/objetivos.json';

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

const num = v => (typeof v === 'number' && isFinite(v) ? v : NaN);
const txt = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);

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

    const vRaw = Array.isArray(body.vendedores) ? body.vendedores : [];
    const vendedores = vRaw.map(v => ({
      codigo: txt(v.codigo, 10), nombre: txt(v.nombre), supervisor: txt(v.supervisor, 60), objetivo: num(v.objetivo),
    }));
    if (!vendedores.length) return res.status(400).json({ error: 'No hay vendedores con objetivo' });
    if (!vendedores.every(v => /^\d+$/.test(v.codigo) && v.nombre && v.supervisor && v.objetivo > 0))
      return res.status(400).json({ error: 'Lista de vendedores inválida' });

    const hRaw = Array.isArray(body.horas) ? body.horas : [];
    const horas = hRaw.map(h => ({ codigo: txt(h.codigo, 10), nombre: txt(h.nombre), horas: num(h.horas) }));
    if (!horas.every(h => /^\d+$/.test(h.codigo) && h.horas >= 0 && h.horas < 24))
      return res.status(400).json({ error: 'Lista de horas inválida' });

    const subtotales = {};
    Object.entries(body.subtotales || {}).forEach(([k, v]) => { if (num(v) > 0) subtotales[txt(k, 60)] = num(v); });

    const { data, sha } = await leer();
    data[mes] = {
      subido: new Date().toISOString(),
      archivo: txt(body.archivo, 200),
      vendedores,
      horas,
      subtotales,
      general: num(body.general) > 0 ? num(body.general) : null,
    };
    const content = Buffer.from(JSON.stringify(data, null, 1)).toString('base64');
    const r = await GH(`contents/${FILE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Objetivos y horas ${mes}: ${vendedores.length} vendedores`, content, ...(sha ? { sha } : {}) }),
    });
    if (!r.ok) throw new Error(await r.text());
    return res.status(200).json({ ok: true, mes, vendedores: vendedores.length, horas: horas.length });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
}
