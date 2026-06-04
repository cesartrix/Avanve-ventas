export const config = { api: { bodyParser: false } };

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = process.env.GITHUB_REPO;   // e.g. "usuario/dashboard-ventas"
const FILE_PATH      = 'data/ventas.xlsx';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const pwd = req.query.pwd || '';
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) return res.status(400).json({ error: 'Archivo vacío' });

  const base64Content = buffer.toString('base64');
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`;

  // Check if file already exists (need its SHA to update)
  let sha = null;
  try {
    const check = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (check.ok) {
      const data = await check.json();
      sha = data.sha;
    }
  } catch (_) {}

  // Create or update file in repo
  const body = {
    message: `Actualizar ventas ${new Date().toISOString().slice(0,10)}`,
    content: base64Content,
    ...(sha ? { sha } : {}),
  };

  const ghRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!ghRes.ok) {
    const err = await ghRes.text();
    return res.status(500).json({ error: 'Error GitHub: ' + err });
  }

  return res.status(200).json({
    ok: true,
    uploadedAt: new Date().toISOString(),
    size: buffer.length,
  });
}
