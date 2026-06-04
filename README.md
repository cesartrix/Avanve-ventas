# Dashboard Ventas — Chess ERP

## Estructura del proyecto

```
dashboard-ventas/
├── api/
│   ├── upload.js      ← recibe el Excel y lo guarda en GitHub
│   └── data-url.js    ← devuelve la URL del Excel actual
├── data/
│   └── .gitkeep       ← carpeta donde se guarda el Excel
├── index.html         ← dashboard principal
├── admin.html         ← panel para subir el Excel
├── vercel.json
└── package.json
```

## Setup

### 1. Crear repo en GitHub y subir archivos
### 2. Importar en Vercel → Deploy
### 3. Crear GitHub Token
   - GitHub → Settings → Developer Settings → Personal access tokens → Fine-grained tokens
   - Permisos: Contents (Read and Write) sobre el repo dashboard-ventas
### 4. Agregar variables de entorno en Vercel → Settings → Environment Variables:
   - `ADMIN_PASSWORD` → contraseña del admin
   - `GITHUB_TOKEN`   → token generado en el paso 3
   - `GITHUB_REPO`    → tuusuario/dashboard-ventas
### 5. Redeploy

## URLs
- Dashboard: https://tu-proyecto.vercel.app
- Admin:     https://tu-proyecto.vercel.app/admin.html
