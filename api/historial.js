const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // List files in data/historial/
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/data/historial`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (r.status === 404) return res.status(200).json({ fechas: [] });
    if (!r.ok) throw new Error('GitHub error: ' + r.status);

    const files = await r.json();
    const fechas = files
      .filter(f => f.name.endsWith('.xlsx'))
      .map(f => ({
        fecha: f.name.replace('.xlsx', ''),
        url: f.download_url,
        size: f.size,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    return res.status(200).json({ fechas });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
