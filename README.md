# Adaptive Testing Platform (MVP)

Production-style full-stack app for **server-controlled adaptive assessments**: students start on a random **EASY** question; difficulty adjusts after each answer; questions never repeat within a session. **No authentication** in this MVP (protect routes in production).

## Tech stack

| Layer    | Choice                          |
|----------|----------------------------------|
| API      | FastAPI (Python), Motor (async) |
| Database | MongoDB                         |
| UI       | React 18, Vite, Zustand, Axios  |

## Folder structure

```
adaptive-testing-platform/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/config.py
│   │   ├── db/mongodb.py
│   │   ├── models/domain.py
│   │   ├── schemas/
│   │   ├── repositories/
│   │   ├── services/
│   │   │   ├── adaptive_engine.py   # get_next_difficulty, selection + fallback
│   │   │   ├── test_service.py      # attempt lifecycle
│   │   │   ├── question_service.py
│   │   │   ├── analytics_service.py
│   │   │   └── bulk_import_service.py
│   │   └── api/routers/
│   ├── scripts/
│   │   ├── seed.py
│   │   └── seed_questions.json
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── pages/
│   │   ├── components/
│   │   └── store/
│   ├── vite.config.ts
│   └── package.json
├── Dockerfile.backend
├── docker-compose.yml
├── .env.example
├── sample_questions_upload.csv
└── README.md
```

## Prerequisites

- Python **3.9+** (3.11 recommended)
- **Node.js 18+** and npm (for the frontend)
- **MongoDB** (local, Atlas, or Docker)

## Quick start

### 1. MongoDB

**Option A — Docker**

```bash
docker compose up -d mongo
```

**Option B — local install**  
Ensure `mongod` is listening on `mongodb://localhost:27017`.

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip3 install -r requirements.txt
cp ../.env.example .env     # edit MONGODB_URI if needed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: `http://127.0.0.1:8000`
- Interactive docs: `http://127.0.0.1:8000/docs` (Swagger UI)

**Question images (Cloudflare R2, optional)**  
Set `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL` in `.env` (see `.env.example`). Admins can upload from **New / Edit question** or paste any public image URL. CSV export includes `image_url`; CSV import accepts optional `image_url` or `image_link` (same meaning).

**Question paper PDF (admin bulk upload)**  
Under **Admin → Bulk upload**, upload a text-based PDF. **`OPENAI_API_KEY` is required**: the model reads the extracted text and emits structured questions (MCQ, True/False, or TITA), inlining **shared reading passages** and **range-specific directions** into each item’s `question_text`. Review and fix answers, then **Save all to question bank**. Install **`pypdf`** via `pip3 install -r requirements.txt`.

### 3. Seed sample questions (optional)

```bash
cd backend
source .venv/bin/activate
export MONGODB_URI=mongodb://localhost:27017   # or your URI
python scripts/seed.py
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to `http://127.0.0.1:8000` (see `frontend/vite.config.ts`).

### Docker (API + MongoDB)

```bash
docker compose up --build
```

API on port **8000**. Run the frontend locally with `npm run dev` and set `CORS_ORIGINS` to match your origin.

**HTTPS in production:** use a reverse proxy (nginx or Caddy) to terminate TLS, serve `frontend/dist`, and proxy `/api` to the API on `127.0.0.1:8000` when running without Docker. See `deploy/SSL.md` and `deploy/nginx.host.conf.example`. For Docker, see `deploy/nginx.prod.conf.example` and `deploy/docker-compose.ssl.yml`.

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string (**required**) |
| `MONGODB_DB_NAME` | Database name (default: `adaptive_testing`) |
| `CORS_ORIGINS` | Comma-separated allowed origins for the browser |
| `DEFAULT_TEST_QUESTION_COUNT` | Default number of questions (default: 10) |
| `DEFAULT_TEST_TIME_LIMIT_SECONDS` | Default timer cap (default: 1800) |
| `OPENAI_API_KEY` | Optional key to generate fresh EXPERT questions after correct EXPERT answers |
| `OPENAI_MODEL` | OpenAI model for generation (default: `gpt-4o-mini`) |
| `OPENAI_API_URL` | OpenAI chat completions endpoint |

Copy `.env.example` to `backend/.env` and adjust.


---

#
### `app_config`

Singleton document `_id: app_config_singleton` for feature flags and defaults (subject/topic filters, defaults).

**Student-facing payloads never include `correct_answer` until after grading on the server.**

---

## Bulk CSV columns

`question_text`, `question_type`, `option_a` … `option_d`, `correct_answer`, `difficulty`, `subject`, `topic`, `tags`, `explanation`

See `sample_questions_upload.csv`.

---

---

## Development tips

- Run backend tests manually via Swagger (`/docs`).
- CORS must include your frontend origin (e.g. Vite on port 5173).
- For production, serve the built frontend (`npm run build`) behind nginx or similar and align `CORS_ORIGINS`.

---

## License

MIT (or your organization’s default).
_acme-challenge.testhub.emgc.in.TXTC7lQB1OTsONiIiks6-f88Tiq35KdsP-P_5HzwDfG1cU