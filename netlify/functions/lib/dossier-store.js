import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import pg from 'pg';

const { Pool } = pg;
let pool;
let schemaPromise;

// A ligação sem pool é a opção mais fiável para escrita curta de dossiers em
// funções serverless. Mantemos as restantes variantes para instalações já
// existentes, mas evitamos que o endpoint pooled com credencial antiga
// bloqueie a criação do Dossier Digital.
const databaseUrl = () => process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || '';
const accessSecret = () => process.env.DOSSIER_ACCESS_SECRET || process.env.ANALYSIS_SESSION_SECRET || '';

function database() {
  const url = databaseUrl();
  if (!url) return null;
  if (!pool) pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 10000 });
  return pool;
}

async function ready() {
  const db = database();
  if (!db || !accessSecret()) return null;
  if (!schemaPromise) schemaPromise = db.query(`
    CREATE TABLE IF NOT EXISTS lm_dossiers (
      id UUID PRIMARY KEY,
      public_id TEXT UNIQUE NOT NULL,
      report_reference TEXT UNIQUE,
      access_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'leonelmendes',
      municipality TEXT,
      location JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_accessed_at TIMESTAMPTZ
    );
    ALTER TABLE lm_dossiers ADD COLUMN IF NOT EXISTS report_reference TEXT UNIQUE;
    CREATE TABLE IF NOT EXISTS lm_report_sequences (
      report_year INTEGER PRIMARY KEY,
      next_number INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lm_dossier_reports (
      id UUID PRIMARY KEY,
      dossier_id UUID NOT NULL REFERENCES lm_dossiers(id) ON DELETE CASCADE,
      report_html TEXT NOT NULL,
      report_text TEXT NOT NULL,
      cost_estimate JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lm_dossier_documents (
      id UUID PRIMARY KEY,
      dossier_id UUID NOT NULL REFERENCES lm_dossiers(id) ON DELETE CASCADE,
      blob_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      category TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS lm_dossiers_public_idx ON lm_dossiers(public_id);
    CREATE INDEX IF NOT EXISTS lm_dossier_reports_dossier_idx ON lm_dossier_reports(dossier_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS lm_dossier_documents_dossier_idx ON lm_dossier_documents(dossier_id, uploaded_at DESC);
  `).catch((error) => { schemaPromise = null; throw error; });
  await schemaPromise;
  return db;
}

function publicId() { return `LM-${randomBytes(5).toString('hex').toUpperCase()}`; }
function rawToken() { return randomBytes(24).toString('base64url'); }
function tokenHash(token) { return createHmac('sha256', accessSecret()).update(String(token)).digest('hex'); }

export async function createDossier({ email, location = null, reportHtml, reportText, costEstimate = null, origin = 'leonelmendes' }) {
  const db = await ready();
  if (!db) return { available: false, reason: 'database_not_configured' };
  const id = randomUUID();
  const idPublic = publicId();
  const token = rawToken();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const year = new Date().getFullYear();
    // A atribuição é atómica: dois relatórios criados em simultâneo nunca
    // recebem o mesmo número. A referência é reiniciada automaticamente em
    // cada ano civil, no formato simples pedido: 1/2026, 2/2026, etc.
    const sequence = await client.query(`
      INSERT INTO lm_report_sequences (report_year,next_number) VALUES ($1,2)
      ON CONFLICT (report_year) DO UPDATE SET next_number=lm_report_sequences.next_number+1
      RETURNING next_number-1 AS report_number
    `, [year]);
    const reportReference = `${sequence.rows[0].report_number}/${year}`;
    await client.query(
      'INSERT INTO lm_dossiers (id,public_id,report_reference,access_hash,email,origin,municipality,location) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, idPublic, reportReference, tokenHash(token), String(email).trim().toLowerCase(), origin, location?.municipio?.nome || null, location || null],
    );
    await client.query(
      'INSERT INTO lm_dossier_reports (id,dossier_id,report_html,report_text,cost_estimate) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), id, reportHtml, reportText, costEstimate],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return { available: true, id: idPublic, token, reportReference };
}

async function findDossier(publicId, token) {
  const db = await ready();
  if (!db) return { db: null, dossier: null };
  if (!/^[A-Z]{2}-[A-F0-9]{10}$/i.test(String(publicId || '')) || !token) return { db, dossier: null };
  const result = await db.query('SELECT * FROM lm_dossiers WHERE public_id=$1 AND access_hash=$2 LIMIT 1', [String(publicId).toUpperCase(), tokenHash(token)]);
  return { db, dossier: result.rows[0] || null };
}

export async function readDossier({ id, token }) {
  const { db, dossier } = await findDossier(id, token);
  if (!db) return { available: false, reason: 'database_not_configured' };
  if (!dossier) return { available: true, authorised: false };
  await db.query('UPDATE lm_dossiers SET last_accessed_at=NOW(),updated_at=NOW() WHERE id=$1', [dossier.id]);
  const reports = await db.query('SELECT report_html,report_text,cost_estimate,created_at FROM lm_dossier_reports WHERE dossier_id=$1 ORDER BY created_at DESC LIMIT 1', [dossier.id]);
  const documents = await db.query('SELECT id,filename,mime_type,size_bytes,category,uploaded_at FROM lm_dossier_documents WHERE dossier_id=$1 ORDER BY uploaded_at DESC', [dossier.id]);
  return { available: true, authorised: true, dossier: { id: dossier.public_id, reportReference: dossier.report_reference || null, municipality: dossier.municipality, location: dossier.location, createdAt: dossier.created_at, report: reports.rows[0] || null, documents: documents.rows } };
}

// Lista estritamente para o painel profissional. Não expõe links privados,
// tokens, conteúdo dos relatórios nem ficheiros; esses elementos continuam
// acessíveis apenas pelo link individual enviado ao cliente.
export async function listDossiers({ limit = 100 } = {}) {
  const db = await ready();
  if (!db) return { available: false, dossiers: [] };
  const result = await db.query(`
    SELECT d.public_id, d.report_reference, d.email, d.municipality, d.created_at, d.updated_at, d.last_accessed_at,
      (SELECT COUNT(*)::int FROM lm_dossier_documents dd WHERE dd.dossier_id=d.id) AS document_count,
      (SELECT COUNT(*)::int FROM lm_dossier_reports dr WHERE dr.dossier_id=d.id) AS report_count
    FROM lm_dossiers d
    ORDER BY d.updated_at DESC
    LIMIT $1
  `, [Math.max(1, Math.min(200, Number(limit) || 100))]);
  return { available: true, dossiers: result.rows.map((row) => ({
    id: row.public_id, reportReference: row.report_reference || null, email: row.email,
    municipality: row.municipality || null, createdAt: row.created_at, updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at, documentCount: Number(row.document_count || 0), reportCount: Number(row.report_count || 0),
  })) };
}

export async function addDossierDocuments({ id, token, documents = [] }) {
  const { db, dossier } = await findDossier(id, token);
  if (!db) return { available: false, reason: 'database_not_configured' };
  if (!dossier) return { available: true, authorised: false };
  const store = getStore({ name: 'lm-private-dossiers', consistency: 'strong' });
  const saved = [];
  for (const document of documents.slice(0, 3)) {
    const bytes = Buffer.from(String(document.base64 || ''), 'base64');
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) continue;
    const fileId = randomUUID();
    const safeName = String(document.nome || 'documento.pdf').replace(/[^\w. -]/g, '_').slice(0, 100);
    const key = `${dossier.id}/${fileId}/${safeName}`;
    await store.set(key, bytes, { metadata: { filename: safeName, mimeType: String(document.mimeType || 'application/pdf'), dossierId: dossier.public_id } });
    await db.query('INSERT INTO lm_dossier_documents (id,dossier_id,blob_key,filename,mime_type,size_bytes,category) VALUES ($1,$2,$3,$4,$5,$6,$7)', [fileId, dossier.id, key, safeName, String(document.mimeType || 'application/pdf'), bytes.length, String(document.tipo || 'documento complementar').slice(0, 60)]);
    saved.push({ id: fileId, filename: safeName, sizeBytes: bytes.length });
  }
  await db.query('UPDATE lm_dossiers SET updated_at=NOW() WHERE id=$1', [dossier.id]);
  return { available: true, authorised: true, saved };
}
