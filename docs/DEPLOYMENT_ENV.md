# Deployment environment variables

## Backend (Cloud Run – crown-api)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGIN` or `ALLOWED_ORIGINS` | Yes (production) | `https://crown-project.vercel.app,http://localhost:3000` | Comma-separated list of allowed origins. Default: `http://localhost:3000` |
| `DB_MODE` | Yes | `socket` (Cloud Run) / `tcp` (local) | Database connection mode |
| `INSTANCE_CONNECTION_NAME` | Yes (Cloud Run) | `gen-lang-client-0711622878:us-central1:crown-services-last-project-db` | Cloud SQL instance |
| `DB_USER` | Yes | `root` | MySQL user |
| `DB_NAME` | Yes | `crown_services` | Database name |
| `DB_PASSWORD` or `DB_PASS` | Yes | (secret) | MySQL password |
| `JWT_SECRET` | Yes | (secret) | JWT signing secret |
| (others) | | | See backend/.env.example |

### Cloud Run – set CORS

```bash
gcloud run services update crown-api --region=us-central1 \
  --set-env-vars=CORS_ORIGIN=https://crown-project.vercel.app,http://localhost:3000 \
  --project=gen-lang-client-0711622878
```

---

## Frontend (Vercel – crown-project)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Yes | `https://crown-api-756273570281.us-central1.run.app` | Backend base URL (no trailing slash, no `/api`). Also accepts `NEXT_PUBLIC_API_URL` as fallback. |

⚠️ **Correct name:** `NEXT_PUBLIC_API_BASE_URL` (not `NEXT_PUBLIC_API_URL`). Code accepts both for compatibility.

### Vercel – set env

1. Project → Settings → Environment Variables
2. Add: `NEXT_PUBLIC_API_BASE_URL` = `https://crown-api-756273570281.us-central1.run.app`
3. Redeploy (env changes require a new build)
