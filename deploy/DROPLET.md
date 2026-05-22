# Deploy frontend + backend on a DigitalOcean droplet

One server serves the React build and proxies `/api` to FastAPI on `127.0.0.1:8000`. No Vercel.

## DNS (registrar)

Point **both** at the droplet public IP (remove Vercel A/CNAME for `@` and `www`):

| Type | Host | Value |
|------|------|--------|
| A | `@` | Droplet IP |
| A | `www` | Droplet IP |

Optional: keep `api.adaptest.in` only if you want a separate API host; for single-domain setup you only need `@` and `www`.

## 1. Backend

```bash
cd /var/www/adaptive-testing-platform/backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
nano .env   # MONGODB_URI, AUTH_JWT_SECRET, CORS_ORIGINS=https://adaptest.in,https://www.adaptest.in
```

`/etc/systemd/system/adaptive-api.service`:

```ini
[Unit]
Description=Adaptive Testing API
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/adaptive-testing-platform/backend
EnvironmentFile=/var/www/adaptive-testing-platform/backend/.env
ExecStart=/var/www/adaptive-testing-platform/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
chown -R www-data:www-data /var/www/adaptive-testing-platform
systemctl daemon-reload && systemctl enable --now adaptive-api
curl http://127.0.0.1:8000/api/health
```

## 2. Frontend build

```bash
cd /var/www/adaptive-testing-platform/frontend
npm ci
npm run build
# creates frontend/dist/
```

## 3. Nginx

Copy `deploy/nginx-adaptest.in.conf.example` to `/etc/nginx/sites-available/adaptest.in`, set `REPO_ROOT`, enable site.

HTTP-only first if certs missing; then:

```bash
certbot --nginx -d adaptest.in -d www.adaptest.in
nginx -t && systemctl reload nginx
```

## 4. Verify

```bash
curl -s https://adaptest.in/api/health
curl -sI https://adaptest.in/
```

Open `https://adaptest.in` in a browser and log in.

## Updates

```bash
cd /var/www/adaptive-testing-platform && git pull
cd backend && .venv/bin/python -m pip install -r requirements.txt
cd ../frontend && npm ci && npm run build
systemctl restart adaptive-api && systemctl reload nginx
```

## Vercel

Disconnect `adaptest.in` / `www` in Vercel Domains so DNS can point to the droplet only.

## Challenge percentile cohort (all participants)

Backfill random ranked scores for every existing `challenge_attempt` (enables live percentiles for new finishers):

```bash
cd backend
.venv/bin/python scripts/backfill_challenge_scores.py
```

Use `--dry-run` first. Default only fills attempts missing `total_marks`; `--refresh-all` overwrites scores.

## Dummy cohort (percentiles / leaderboard)

From `backend/` on the server (uses `MONGODB_URI` from `.env`):

```bash
cd /var/www/adaptive-testing-platform/backend
source .venv/bin/activate
python scripts/seed_dummy_cohort.py --dry-run --students 25 --challenges 5
python scripts/seed_dummy_cohort.py --students 25 --challenges 5
```

- Creates real student accounts (normal usernames, tagged `is_seed_dummy` in MongoDB), public profiles with IIT/IIM-style bios, open challenges, and **completed** attempts with varied scores.
- Default password: `SeedDummy1!` (override with `SEED_PASSWORD`).
- Remove later: `python scripts/seed_dummy_cohort.py --purge-only`
