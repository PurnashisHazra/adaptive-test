# AdapTest Website Leads Backend

Small Express + MongoDB backend for `Try/Buy` lead capture.

## Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Fill values in `.env`:

- `MONGO_URI`
- `MONGO_DB_NAME`
- `MONGO_COLLECTION_NAME`
- `PORT` (optional, defaults to `8787`)

3. Install and run:

```bash
npm install
npm start
```

## API

- `GET /health`
- `POST /api/leads`

Payload:

```json
{
  "name": "Jane Doe",
  "institution_name": "ABC Institute",
  "contact_number": "+919876543210",
  "email": "jane@example.com",
  "model_name": "Subscription"
}
```

## Deploy note

If website is served via Nginx, proxy `/api/` to this backend service.
