#!/usr/bin/env tsx
/**
 * provision-org.ts — Builds one study org (Fixture Y or R) per PROTOCOL.md §3.
 *
 * Mirrors api/routes/domains/create.ts step-for-step, minus the Plaid
 * exchange (fixtures are seeded ledgers, not live connections):
 *   signup → Arthur → per domain: pendragon_domains doc → workspace from
 *   blueprint → PATCH tools/A2A → start → health → (demographics seed) →
 *   bridge + contract docs → sync-env.
 *
 * Usage:
 *   STUDY_TOKEN=<firebase idToken> GCP_TOKEN=$(gcloud auth print-access-token) \
 *   npx tsx study/provision-org.ts Y
 *
 * Prints workspace ids for gen-fixtures.ts when done.
 */

import { DOMAIN_TOOLS, DOMAIN_ACTIONS } from '../api/services/domain-constants';

const PENDRAGON = process.env.PENDRAGON_URL || 'https://pendragon.foxtrotcommunications.net';
const ROUNDTABLE = process.env.ROUNDTABLE_URL || 'https://roundtable.foxtrotcommunications.net';
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/roundtable-public/databases/(default)/documents';

const TOKEN = process.env.STUDY_TOKEN!;
const GCP = process.env.GCP_TOKEN!;
if (!TOKEN || !GCP) { console.error('STUDY_TOKEN and GCP_TOKEN required'); process.exit(1); }

const FIXTURES: Record<string, { orgName: string; domains: string[]; profile: any; household: any[] }> = {
  Y: {
    orgName: 'Study Fixture Y',
    domains: ['checking', 'investments', 'demographics'],
    profile: { displayName: 'A. Morgan', dateOfBirth: '1996-03-15', stateOfResidence: 'MO', filingStatus: 'married_filing_jointly', employmentStatus: 'employed' },
    household: [
      { relationship: 'spouse', name: 'J. Morgan', age: 30, isDependent: false },
      { relationship: 'child', name: 'Child One', age: 4, isDependent: true },
      { relationship: 'child', name: 'Child Two', age: 2, isDependent: true },
    ],
  },
  R: {
    orgName: 'Study Fixture R',
    domains: ['checking', 'retirement', 'demographics'],
    profile: { displayName: 'A. Morgan', dateOfBirth: '1959-03-15', stateOfResidence: 'MO', filingStatus: 'married_filing_jointly', employmentStatus: 'retired' },
    household: [
      { relationship: 'spouse', name: 'J. Morgan', age: 67, isDependent: false },
    ],
  },
};

const fixture = FIXTURES[(process.argv[2] || '').toUpperCase()];
if (!fixture) { console.error('Usage: provision-org.ts <Y|R>'); process.exit(1); }

/* ── helpers ── */
async function api(base: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

function fsVal(v: any): any {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
}

async function fsCreate(collectionPath: string, data: Record<string, any>): Promise<string> {
  const res = await fetch(`${FS_BASE}/${collectionPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GCP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsVal(v)])) }),
  });
  const body = await res.json() as any;
  if (!res.ok) throw new Error(`fsCreate ${collectionPath}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.name.split('/').pop();
}

async function fsPatch(docPath: string, data: Record<string, any>): Promise<void> {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const res = await fetch(`${FS_BASE}/${docPath}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${GCP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsVal(v)])) }),
  });
  if (!res.ok) throw new Error(`fsPatch ${docPath}: ${(await res.text()).slice(0, 300)}`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── main ── */
(async () => {
  // 1. Signup (idempotent: 409 means the org already exists)
  console.log(`[1] signup: ${fixture.orgName}`);
  let orgId: string;
  try {
    const s = await api(PENDRAGON, '/api/auth/signup', { method: 'POST', body: JSON.stringify({ orgName: fixture.orgName, plan: 'starter' }) });
    orgId = s.org?.id || s.orgId;
  } catch (e: any) {
    if (!e.message.includes('409')) throw e;
    console.log('    org exists — continuing');
    orgId = '';
  }

  // 2. Wait for Arthur
  console.log('[2] waiting for Arthur workspace...');
  let me: any = null;
  for (let i = 0; i < 60; i++) {
    me = await api(PENDRAGON, '/api/auth/me');
    if (me.arthurWorkspaceId) break;
    await sleep(5000);
  }
  if (!me?.arthurWorkspaceId) throw new Error('Arthur never provisioned');
  orgId = orgId || me.orgId || me.org?.id;
  const arthurWsId = me.arthurWorkspaceId;
  const uid = me.uid || me.user?.uid;
  console.log(`    org=${orgId} arthur=${arthurWsId} uid=${uid}`);

  const created: Record<string, string> = {};

  for (const domainType of fixture.domains) {
    const wsName = domainType === 'checking' ? 'Checking & Savings'
      : domainType.charAt(0).toUpperCase() + domainType.slice(1);
    console.log(`\n[3] domain: ${domainType}`);

    // 3a. pendragon_domains doc
    const domainId = await fsCreate('pendragon_domains', {
      uid, domainType, domainName: wsName, workspaceId: null, plaidItemId: null,
      connectionId: null, connections: [], bridgeId: null, contractId: null,
      accountCount: 0, status: 'creating', studyFixture: true,
      createdAt: new Date(), updatedAt: new Date(),
    });

    // 3b. workspace from blueprint
    const ws = await api(ROUNDTABLE, '/api/workspaces', { method: 'POST', body: JSON.stringify({ name: wsName, template: `pendragon-${domainType}` }) });
    const wsId = ws.id;
    if (!ws.systemPrompt) throw new Error(`blueprint pendragon-${domainType} did not apply (empty system prompt)`);
    await fsPatch(`pendragon_domains/${domainId}`, { workspaceId: wsId });
    console.log(`    ws=${wsId}`);

    // 3c. tools + A2A
    await api(ROUNDTABLE, `/api/workspaces/${wsId}`, {
      method: 'PATCH',
      body: JSON.stringify({ a2aServerEnabled: true, toolsEnabled: (DOMAIN_TOOLS as any)[domainType] || DOMAIN_TOOLS.checking }),
    });

    // 3d. start + info
    await api(ROUNDTABLE, `/api/workspaces/${wsId}/start`, { method: 'POST' });
    const info = await api(ROUNDTABLE, `/api/workspaces/${wsId}`);
    const wsUrl = info.url;
    if (info.a2aApiKey) await fsPatch(`pendragon_domains/${domainId}`, { a2aApiKey: info.a2aApiKey });

    // 3e. health poll
    let healthy = false;
    for (let i = 0; i < 60; i++) {
      try {
        const h = await fetch(`${wsUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (h.ok) { healthy = true; break; }
      } catch { /* waking */ }
      await sleep(2000);
    }
    console.log(`    health: ${healthy ? 'ok' : 'TIMEOUT (continuing)'}`);

    // 3f. demographics profile
    if (domainType === 'demographics') {
      await api(ROUNDTABLE, `/api/workspaces/${wsId}/seed-demographics`, {
        method: 'POST',
        body: JSON.stringify({ profile: fixture.profile, household: fixture.household }),
      });
      console.log('    demographics seeded');
    }

    // 3g. bridge + contract (exact field shapes from create.ts)
    const bridgeId = await fsCreate(`organizations/${orgId}/bridges`, {
      name: `Arthur ↔ ${wsName}`,
      endpointA: { orgId, wsId: arthurWsId, name: 'Arthur' },
      endpointB: { orgId, wsId, name: wsName },
      permissions: ['message', 'delegate'],
      status: 'active', createdBy: uid, createdAt: new Date(),
    });
    const contractId = await fsCreate(`organizations/${orgId}/contracts`, {
      name: `Pendragon ${wsName}`, type: 'DataQuery',
      source: { orgId, wsId: arthurWsId, name: 'Arthur' },
      target: { orgId, wsId, name: wsName },
      allowedActions: (DOMAIN_ACTIONS as any)[domainType] || DOMAIN_ACTIONS.checking,
      requires: [], status: 'active',
      approval: {
        sourceApproved: true, targetApproved: true,
        sourceApprovedAt: new Date(), targetApprovedAt: new Date(),
        sourceApprovedBy: 'system', targetApprovedBy: 'system',
      },
      createdAt: new Date(), updatedAt: new Date(), createdBy: uid,
    });
    await fsPatch(`pendragon_domains/${domainId}`, { bridgeId, contractId, status: 'active', updatedAt: new Date() });
    console.log(`    bridge=${bridgeId} contract=${contractId}`);

    created[domainType] = wsId;
  }

  // 4. sync-env so Arthur + domains pick up new bridges
  console.log('\n[4] sync-env');
  for (const wsId of [arthurWsId, ...Object.values(created)]) {
    try { await api(ROUNDTABLE, `/api/workspaces/${wsId}/sync-env`, { method: 'POST' }); }
    catch (e: any) { console.warn(`    sync-env ${wsId} failed (${e.message.slice(0, 80)}) — restarting`); await api(ROUNDTABLE, `/api/workspaces/${wsId}/restart`, { method: 'POST' }).catch(() => {}); }
  }

  console.log('\n═══ DONE ═══');
  console.log(`org: ${orgId}`);
  console.log(`arthur: ${arthurWsId}`);
  for (const [t, id] of Object.entries(created)) console.log(`${t}: ${id}`);
  console.log(`\nNext: npx tsx study/gen-fixtures.ts ${process.argv[2].toUpperCase()} ${created.checking} ${created.investments || created.retirement} | kubectl-exec psql`);
})();
