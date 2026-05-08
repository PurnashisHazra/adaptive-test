import "dotenv/config";
import cors from "cors";
import express from "express";
import { MongoClient } from "mongodb";

const PORT = Number(process.env.PORT || 8787);
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lobrockyl:Moyyn123@consultdg.ocafbf0.mongodb.net/?retryWrites=true&w=majority&appName=ConsultDG";
const DB_NAME = process.env.MONGO_DB_NAME || "adaptest";
const COLLECTION_NAME = process.env.MONGO_COLLECTION_NAME || "website_leads";

if (!MONGO_URI) {
  throw new Error("MONGO_URI is required");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const client = new MongoClient(MONGO_URI);
await client.connect();
const col = client.db(DB_NAME).collection(COLLECTION_NAME);
await col.createIndex({ created_at: -1 });
await col.createIndex({ email: 1 });

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/leads", async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const institution_name = String(body.institution_name || "").trim();
  const contact_number = String(body.contact_number || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const model_name = String(body.model_name || "").trim();

  if (!name || !institution_name || !contact_number || !email || !model_name) {
    return res.status(400).json({ detail: "All fields are required" });
  }

  await col.insertOne({
    name,
    institution_name,
    contact_number,
    email,
    model_name,
    source: "adaptest-website",
    created_at: new Date(),
  });
  return res.status(201).json({ ok: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`leads-backend listening on :${PORT}`);
});
