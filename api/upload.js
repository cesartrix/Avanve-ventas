export const config = { api: { bodyParser: false } };

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;

async function putFile(path, buffer, sha) {
  const body = {
    message: `Actualizar ${path} ${new Date().toISOString().slice(0,10)}`,
    content: buffer.toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function getSha(path) {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (r.status === 404) return null;
  const d = await r.json();
  return d.sha || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const pwd = req.query.pwd || '';
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) return res.status(400).json({ error: 'Archivo vacío' });

  try {
    // 1. Save as current ventas.xlsx
    const sha = await getSha('data/ventas.xlsx');
    await putFile('data/ventas.xlsx', buffer, sha);

    // 2. Save dated copy in historial/
    const today = new Date().toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).split('/').reverse().join('-'); // → YYYY-MM-DD
    const histPath = `data/historial/${today}.xlsx`;
    const histSha = await getSha(histPath);
    await putFile(histPath, buffer, histSha);

    return res.status(200).json({ ok: true, uploadedAt: new Date().toISOString(), size: buffer.length, fecha: today });
  } catch (err) {
    return res.status(500).json({ error: 'Error GitHub: ' + err.message });
  }
}
