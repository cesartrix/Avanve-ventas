const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "usuario/dashboard-ventas"
const FILE_PATH   = 'data/ventas.xlsx';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`;
    const ghRes  = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (ghRes.status === 404) {
      return res.status(404).json({ error: 'No hay archivo cargado todavía' });
    }
    if (!ghRes.ok) {
      return res.status(500).json({ error: 'Error GitHub: ' + ghRes.status });
    }

    const data = await ghRes.json();

    // data.download_url is the public raw URL — works for public repos
    return res.status(200).json({
      url: data.download_url,
      uploadedAt: data.sha ? new Date().toISOString() : null,
      size: data.size,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
