export const config = { api: { bodyParser: false } };

// Vercel limita el cuerpo de cada request a ~4.5 MB. Para Excel más grandes,
// admin.html sube el archivo en partes (<= 3 MB c/u):
//   1) POST ?pwd=..&mode=part      body = bytes de la parte  -> se guarda como blob en GitHub, devuelve { sha }
//   2) POST ?pwd=..&mode=finalize  body = JSON { parts:[sha,...] } -> une las partes y guarda ventas.xlsx + historial
// Sin "mode" se mantiene el comportamiento viejo (archivo entero en un solo POST).

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;

const GH = (path, init = {}) => fetch(`https://api.github.com/repos/${GITHUB_REPO}/${path}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  },
});

async function putFile(path, buffer, sha) {
  const body = {
    message: `Actualizar ${path} ${new Date().toISOString().slice(0,10)}`,
    content: buffer.toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const r = await GH(`contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function getSha(path) {
  const r = await GH(`contents/${path}`);
  if (r.status === 404) return null;
  const d = await r.json();
  return d.sha || null;
}

async function createBlob(buffer) {
  const r = await GH('git/blobs', { method: 'POST', body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' }) });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).sha;
}

async function readBlob(sha) {
  const r = await GH(`git/blobs/${sha}`);
  if (!r.ok) throw new Error(await r.text());
  const d = await r.json();
  return Buffer.from(d.content, 'base64');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function saveExcel(buffer) {
  const sha = await getSha('data/ventas.xlsx');
  await putFile('data/ventas.xlsx', buffer, sha);

  const today = new Date().toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).split('/').reverse().join('-'); // → YYYY-MM-DD
  const histPath = `data/historial/${today}.xlsx`;
  const histSha = await getSha(histPath);
  await putFile(histPath, buffer, histSha);
  return today;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const pwd = req.query.pwd || '';
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const mode = req.query.mode || '';

  try {
    const buffer = await readBody(req);

    // 1) Parte de un upload en partes
    if (mode === 'part') {
      if (buffer.length === 0) return res.status(400).json({ error: 'Parte vacía' });
      const sha = await createBlob(buffer);
      return res.status(200).json({ ok: true, sha, size: buffer.length });
    }

    // 2) Unir partes y guardar
    if (mode === 'finalize') {
      let parts;
      try { parts = JSON.parse(buffer.toString('utf8')).parts; } catch { parts = null; }
      if (!Array.isArray(parts) || parts.length === 0 || !parts.every(s => /^[0-9a-f]{40}$/.test(s)))
        return res.status(400).json({ error: 'Lista de partes inválida' });
      const bufs = [];
      for (const sha of parts) bufs.push(await readBlob(sha));
      const full = Buffer.concat(bufs);
      const fecha = await saveExcel(full);
      return res.status(200).json({ ok: true, uploadedAt: new Date().toISOString(), size: full.length, fecha });
    }

    // Modo viejo: archivo entero en un solo request
    if (buffer.length === 0) return res.status(400).json({ error: 'Archivo vacío' });
    const fecha = await saveExcel(buffer);
    return res.status(200).json({ ok: true, uploadedAt: new Date().toISOString(), size: buffer.length, fecha });
  } catch (err) {
    return res.status(500).json({ error: 'Error GitHub: ' + err.message });
  }
}
