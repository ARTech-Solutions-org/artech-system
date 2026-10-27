# Studio OS

Projects, team, equipment and installations dashboard. See `PLAN.md` for the roadmap.

Staff handbook (how to use the system, not how to install it): [English PDF](docs/ARTECH-Studio-OS-Handbook-EN.pdf) · [PDF العربية](docs/ARTECH-Studio-OS-Handbook-AR.pdf)

| Folder | Contents |
|---|---|
| `dashboard/` | Next.js app (UI, API, auth, permissions) |
| `docker/` | Postgres init scripts |
| `backups/` | Daily Postgres backups (not committed) |
| `legacy/` | Old Google Sheets + n8n form system, kept until cutover |

## Run

```powershell
cd C:\n8n\studio-os
docker compose up -d          # Postgres (localhost:5433), n8n (localhost:5678), backups
cd dashboard
npm install
npm run dev                   # http://localhost:3000
```

## Secrets

- `.env` (repo root) holds the Postgres password and `N8N_ENCRYPTION_KEY`. Copy from `.env.example` on a new machine.
  Keep a copy somewhere safe: without `N8N_ENCRYPTION_KEY`, credentials saved in n8n cannot be decrypted.
- `dashboard/.env.local` holds `DATABASE_URL` and `N8N_URL`.

## Backups

Run daily into `backups/` (7 daily, 4 weekly, 6 monthly) for both the `studio_os` and `n8n` databases.
Manual backup: `docker exec studio-os-backup /backup.sh`

Restore example:

```powershell
docker cp backups\daily\studio_os-20261004.sql.gz studio-os-postgres:/tmp/restore.sql.gz
docker exec studio-os-postgres sh -c "gunzip -c /tmp/restore.sql.gz | psql -U studio -d studio_os"
```
