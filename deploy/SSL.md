# HTTPS (SSL) for the hosted app

The browser loads the SPA and calls the API at **`/api` on the same origin**. In production, terminate TLS on a reverse proxy (nginx or Caddy) that:

1. Serves the built files from `frontend/dist/`
2. Proxies `/api/` to your FastAPI process (typically on `127.0.0.1:8000`)

---

## A. Direct install on the server (no Docker)

Assume: Linux server, DNS for `YOUR_DOMAIN` points here, you run MongoDB (local or Atlas), Python API, and nginx on the same machine.

### 1. Build the frontend

```bash
cd /path/to/adaptive-testing-platform/frontend
npm ci
npm run build
```

Confirm `frontend/dist/index.html` exists.

### 2. Backend environment

In `backend/.env` (or your process environment), set at least:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017   # or your Atlas URI
CORS_ORIGINS=https://YOUR_DOMAIN
```

Only the public `https://` origin should be listed for a single-domain deploy.

### 3. Run the API bound to localhost

Nginx will connect to the API on the loopback interface so port **8000** does not need to be open on the public firewall.

```bash
cd /path/to/adaptive-testing-platform/backend
source .venv/bin/activate   # or create venv and pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

For a long-running server, use **systemd** (see optional example below) or another process manager.

### 4. TLS certificates (Let’s Encrypt)

If nothing is listening on **80** yet:

```bash
sudo apt update && sudo apt install -y certbot
sudo certbot certonly --standalone -d YOUR_DOMAIN
```

Certs are usually:

- `/etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem`
- `/etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem`

If **nginx already uses port 80**, stop nginx briefly for standalone certbot, or use `certbot certonly --webroot` / DNS challenge. See [Certbot docs](https://eff-certbot.readthedocs.io/).

### 5. Nginx site config

```bash
sudo cp deploy/nginx.host.conf.example /etc/nginx/sites-available/adaptest
sudo nano /etc/nginx/sites-available/adaptest
```

- Replace every `YOUR_DOMAIN`
- Replace `REPO_ROOT` with the absolute repo path (no trailing slash), e.g. `/home/ubuntu/adaptive-testing-platform`

Enable and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/adaptest /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Firewall

Allow **80** and **443** from the internet. Do **not** expose **8000** publicly if the API listens only on `127.0.0.1`.

### Optional: systemd unit for the API

Example `/etc/systemd/system/adaptest-api.service` (adjust `User` and paths):

```ini
[Unit]
Description=AdapTest FastAPI
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/adaptive-testing-platform/backend
EnvironmentFile=/path/to/adaptive-testing-platform/backend/.env
ExecStart=/path/to/adaptive-testing-platform/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now adaptest-api
```

---

## B. Same stack with Docker (optional)

If you later move to containers, use `deploy/nginx.prod.conf.example` (upstream `api:8000`) and `deploy/docker-compose.ssl.yml` as documented previously in this file’s history, or see `README.md`.

---

## C. TLS terminated elsewhere (Cloudflare, load balancer)

Enable HTTPS on the edge, forward HTTP(S) to your origin, and keep the same routing: static app + `/api` → FastAPI. Set `CORS_ORIGINS` to the public `https://` origin users see in the browser.

---

## D. Caddy on the host (automatic HTTPS)

Install Caddy, point DNS here, and use a `Caddyfile` with `reverse_proxy /api* 127.0.0.1:8000` and `file_server` / `try_files` for the SPA root. Caddy will obtain certificates automatically for the configured domain.
