import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
let pool;
let schemaPromise;

// NETLIFY_DB_URL é a variável nativa atual. Mantêm-se os dois nomes antigos
// para compatibilidade com uma base Neon ligada anteriormente ao projeto.
function databaseUrl() { return process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || ''; }
function database() {
  // Enquanto o painel interno não estiver em uso, não tentar ligar a uma base
  // antiga/inválida. Assim a atividade principal do site não depende dela.
  if (process.env.ENABLE_OPERATION_METRICS !== 'true') return null;
  if (!databaseUrl()) return null;
  if (!pool) pool = new Pool({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 10_000 });
  return pool;
}

async function ready() {
  const db = database();
  if (!db) return null;
  if (!schemaPromise) schemaPromise = db.query(`
    CREATE TABLE IF NOT EXISTS lm_operation_metrics (
      request_id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      email_hash TEXT,
      municipality TEXT,
      model TEXT,
      prompt_tokens INTEGER,
      output_tokens INTEGER,
      duration_ms INTEGER,
      documents_count SMALLINT NOT NULL DEFAULT 0,
      professional_access BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS lm_operation_metrics_email_time_idx ON lm_operation_metrics (email_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS lm_operation_metrics_time_idx ON lm_operation_metrics (created_at DESC);
  `).catch((error) => {
    // Uma indisponibilidade momentânea não pode deixar a instância presa numa
    // promessa rejeitada até ao próximo reinício da função.
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
  return db;
}

function hashedEmail(email = '') {
  const secret = process.env.ANALYSIS_SESSION_SECRET || process.env.RESEND_API_KEY || 'lm-operation-metrics';
  return createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('hex');
}

export async function beginAnalysis({ email, municipality = null, documentsCount = 0, professionalAccess = false }) {
  const db = await ready();
  if (!db) return { requestId: null, tracking: false };
  const emailHash = hashedEmail(email);
  const limitEnabled = process.env.ENFORCE_TRIAL_LIMIT === 'true';
  const maxTrial = Math.max(1, Math.min(20, Number(process.env.TRIAL_MAX_ANALYSES || 3)));
  if (limitEnabled && !professionalAccess) {
    const usage = await db.query(`SELECT COUNT(*)::int AS total FROM lm_operation_metrics WHERE email_hash = $1 AND event_type = 'analysis' AND created_at > NOW() - INTERVAL '30 days'`, [emailHash]);
    if (Number(usage.rows[0]?.total || 0) >= maxTrial) {
      const error = new Error(`O acesso experimental atingiu o limite de ${maxTrial} análises em 30 dias. Contacte o Atelier para continuar.`);
      error.code = 'TRIAL_LIMIT_REACHED';
      throw error;
    }
  }
  const requestId = randomUUID();
  await db.query(`INSERT INTO lm_operation_metrics (request_id,event_type,status,email_hash,municipality,documents_count,professional_access) VALUES ($1,'analysis','started',$2,$3,$4,$5)`, [requestId, emailHash, municipality, documentsCount, professionalAccess]);
  return { requestId, tracking: true };
}

export async function finishAnalysis(requestId, { status, model = null, promptTokens = null, outputTokens = null, durationMs = null } = {}) {
  if (!requestId) return;
  const db = await ready();
  if (!db) return;
  await db.query(`UPDATE lm_operation_metrics SET status=$2, completed_at=NOW(), model=$3, prompt_tokens=$4, output_tokens=$5, duration_ms=$6 WHERE request_id=$1`, [requestId, status, model, promptTokens, outputTokens, durationMs]);
}

// Regista somente atividade agregada para o painel interno. Não são guardados
// nome, telefone, conteúdo, documentos ou e-mail em claro.
export async function recordOperation({ eventType, email = '', municipality = null, status = 'completed', documentsCount = 0 } = {}) {
  const db = await ready();
  if (!db || !eventType) return { tracking: false };
  await db.query(
    `INSERT INTO lm_operation_metrics (request_id,event_type,status,email_hash,municipality,documents_count,professional_access,completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE,NOW())`,
    [randomUUID(), String(eventType).slice(0, 60), String(status).slice(0, 60), email ? hashedEmail(email) : null, municipality ? String(municipality).slice(0, 80) : null, Math.max(0, Number(documentsCount) || 0)],
  );
  return { tracking: true };
}

export async function operationSummary() {
  const db = await ready();
  if (!db) return { tracking: false, message: 'A Netlify Database ainda não está ligada a este projeto. Ative-a em Project configuration → Database e faça novo deploy.' };
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE event_type='analysis')::int AS total_analyses,
      COUNT(*) FILTER (WHERE event_type='analysis' AND status='completed')::int AS completed_analyses,
      COUNT(*) FILTER (WHERE event_type='analysis' AND status<>'completed')::int AS unsuccessful_analyses,
      COALESCE(ROUND(AVG(prompt_tokens) FILTER (WHERE status='completed')),0)::int AS average_prompt_tokens,
      COALESCE(ROUND(AVG(output_tokens) FILTER (WHERE status='completed')),0)::int AS average_output_tokens,
      COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE status='completed')),0)::int AS average_duration_ms,
      COUNT(DISTINCT email_hash) FILTER (WHERE event_type='analysis')::int AS distinct_contacts
    FROM lm_operation_metrics
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  const activity = await db.query(`
    SELECT event_type, COUNT(*)::int AS total, MAX(created_at) AS last_at
    FROM lm_operation_metrics
    WHERE created_at > NOW() - INTERVAL '30 days' AND event_type <> 'analysis'
    GROUP BY event_type
    ORDER BY last_at DESC
  `);
  return { tracking: true, period: 'Últimos 30 dias', ...(rows[0] || {}), service_activity: activity.rows || [] };
}
