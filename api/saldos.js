// Saldos de cuenta corriente por comprobante, cargados desde admin.html
// (Excel "saldo total" de Chess; se lee en el navegador y acá llega ya convertido a JSON).
// Se guarda en GitHub como data/saldos_ctacte.json:
//   { subido, archivo, fecha, cps: [ {e, c, cn, loc, v, vn, t, nro, f, fv, ve, d, imp, s, r} ] }
//   e = empresa, c/cn = cliente (código / razón social), loc = localidad, v/vn = vendedor (código / nombre),
//   t = tipo de comprobante, nro, f = fecha, fv = vencimiento, ve = vencido (bool), d = días de mora,
//   imp = importe total, s = saldo, r = ruta
// GET               -> el JSON (404 si todavía no se cargó)
// POST ?pwd=...     body { archivo, fecha, cps } -> reemplaza el archivo completo

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const FILE_PATH      = 'data/saldos_ctacte.json';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const GH = (path, init = {}) => fetch(`https://api.github.com/repos/${GITHUB_REPO}/${path}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  },
});

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

const num = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
const int = v => (typeof v === 'number' && isFinite(v) ? Math.round(v) : 0);
const txt = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);
const fecha = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
        headers: { Accept: 'application/vnd.github.raw', ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}) },
      });
      if (r.status === 404) return res.status(404).json({ error: 'Todavía no se cargaron saldos' });
      if (!r.ok) return res.status(500).json({ error: 'Error GitHub: ' + r.status });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(await r.text());
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if ((req.query.pwd || '') !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const body = await readBody(req);
    const raw = Array.isArray(body.cps) ? body.cps : [];
    if (!raw.length) return res.status(400).json({ error: 'No hay comprobantes' });
    if (raw.length > 50000) return res.status(400).json({ error: 'Demasiados comprobantes' });
    const cps = raw.map(x => ({
      e: txt(x.e, 60), c: txt(x.c, 12), cn: txt(x.cn, 100), loc: txt(x.loc, 60),
      v: txt(x.v, 10), vn: txt(x.vn, 60), t: txt(x.t, 30), nro: txt(x.nro, 30),
      f: fecha(x.f), fv: fecha(x.fv), ve: !!x.ve, d: int(x.d), imp: num(x.imp), s: num(x.s), r: txt(x.r, 60),
    }));
    if (!cps.every(x => /^\d+$/.test(x.c) && /^\d+$/.test(x.v)))
      return res.status(400).json({ error: 'Comprobantes con cliente o vendedor inválido' });

    const data = { subido: new Date().toISOString(), archivo: txt(body.archivo, 200), fecha: fecha(body.fecha), cps };
    let sha = null;
    const g = await GH(`contents/${FILE_PATH}`);
    if (g.ok) sha = (await g.json()).sha || null;
    else if (g.status !== 404) throw new Error('GitHub ' + g.status);
    const content = Buffer.from(JSON.stringify(data)).toString('base64');
    const r = await GH(`contents/${FILE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Saldos cta cte ${data.fecha || ''}: ${cps.length} comprobantes`, content, ...(sha ? { sha } : {}) }),
    });
    if (!r.ok) throw new Error(await r.text());
    const saldo = cps.reduce((a, x) => a + x.s, 0);
    return res.status(200).json({ ok: true, comprobantes: cps.length, saldo: Math.round(saldo), fecha: data.fecha });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
}
