#!/usr/bin/env tsx
/**
 * apply-sql.ts — Apply a SQL file inside a workspace pod, over that pod's own
 * DATABASE_URL role (so RLS `workspace_id = current_user` is satisfied).
 *
 * Mirrors scripts/seed-demo-goals.ts: pipe a node script to
 * `kubectl exec -i -n <ns> <pod> -c workspace -- node`, executing each
 * statement through the pod's pg pool. Statement splitting is naive
 * (newline-delimited), matching the emitters here which put one statement
 * per line and never embed a literal newline inside a value.
 *
 * Usage:
 *   npx tsx study/apply-sql.ts <namespace> <workspaceId> <sqlFile>
 */
import { execSync } from 'child_process';
import fs from 'fs';

const [, , namespace, wsId, sqlFile] = process.argv;
if (!namespace || !wsId || !sqlFile) {
  console.error('Usage: apply-sql.ts <namespace> <workspaceId> <sqlFile>');
  process.exit(1);
}

// Pod names carry only the first 12 chars of the workspace id, lowercased:
// rt-ws-<first12lower>-<hash>.
const podPrefix = wsId.slice(0, 12).toLowerCase();
const podName = execSync(
  `kubectl get pods -n ${namespace} --no-headers -o custom-columns=":metadata.name" | grep "${podPrefix}" | head -1`,
  { encoding: 'utf-8', shell: '/bin/bash' },
).trim();
if (!podName) { console.error(`no pod for ${wsId} in ${namespace}`); process.exit(1); }

const statements = fs.readFileSync(sqlFile, 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);
const nodeScript = [
  `const { Pool } = require('pg');`,
  `const pool = new Pool({ connectionString: process.env.DATABASE_URL });`,
  `async function run() {`,
  `  const stmts = ${JSON.stringify(statements)};`,
  `  const out = [];`,
  `  for (const s of stmts) { const r = await pool.query(s); if (r.rows && r.rows.length) out.push(JSON.stringify(r.rows)); }`,
  `  console.log('OK ' + out.join(' '));`,
  `  await pool.end();`,
  `}`,
  `run().catch(e => { console.error('ERR:', e.message); process.exit(1); });`,
].join('\n');

const output = execSync(
  `kubectl exec -i -n ${namespace} ${podName} -c workspace -- node`,
  { encoding: 'utf-8', timeout: 60000, input: nodeScript },
).trim();
if (output.includes('ERR:')) { console.error(output); process.exit(1); }
console.log(`[${wsId}] ${statements.length} stmts → ${output}`);
