// scripts/cleanup-conversations.mjs
import 'dotenv/config';
import Twilio from 'twilio';

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_CONVERSATIONS_SERVICE_SID,
  TWILIO_REGION,
  TWILIO_EDGE,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_CONVERSATIONS_SERVICE_SID) {
  console.error('Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_CONVERSATIONS_SERVICE_SID');
  process.exit(1);
}

const client = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, {
  autoRetry: true,
  maxRetries: 3,
  keepAlive: true,
  region: TWILIO_REGION || undefined,
  edge: TWILIO_EDGE || undefined,
});

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');      // solo listar
const HARD = args.has('--hard');     // también remover participantes
const DELETE = args.has('--delete'); // borrar conversación (requiere estado closed)

const service = client.conversations.v1.services(TWILIO_CONVERSATIONS_SERVICE_SID);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function listAllConversations(pageSize = 100) {
  const out = [];
  let page = await service.conversations.page({ pageSize });
  while (page) {
    out.push(...page.instances);
    if (!page.hasNextPage) break;
    page = await page.nextPage();
  }
  return out;
}

async function removeAllParticipants(conversationSid) {
  const parts = await service.conversations(conversationSid).participants.list({ limit: 200 });
  let removed = 0;
  for (const p of parts) {
    try {
      await service.conversations(conversationSid).participants(p.sid).remove();
      removed++;
    } catch (e) {
      console.warn(`[WARN] remove participant ${p.sid} failed:`, e?.message || e);
    }
    await sleep(50);
  }
  return removed;
}

async function closeOne(convo) {
  const sid = convo.sid;
  const uniqueName = convo.uniqueName;
  const prev = String(convo.state || convo.status || '').toLowerCase();

  if (DRY) return { sid, uniqueName, prev, now: prev, partsRemoved: 0, deleted: false, skipped: true };

  // Intenta cierre directo
  if (prev !== 'closed') {
    try {
      await service.conversations(sid).update({ state: 'closed' });
    } catch (e) {
      // Fallback con timers=PT0S si el cierre directo falla
      console.warn(`[WARN] state=closed failed for ${sid}: ${e?.message || e}. Falling back to timers.`);
      await service.conversations(sid).update({
        'timers.inactive': 'PT0S',
        'timers.closed': 'PT0S',
      });
    }
  }

  let partsRemoved = 0;
  if (HARD) {
    partsRemoved = await removeAllParticipants(sid);
  }

  let deleted = false;
  if (DELETE) {
    try { await service.conversations(sid).remove(); deleted = true; }
    catch (e) { console.warn(`[WARN] delete ${sid} failed:`, e?.message || e); }
  }

  return { sid, uniqueName, prev, now: 'closed', partsRemoved, deleted, skipped: false };
}

async function run() {
  const all = await listAllConversations(100);
  console.log(`Found ${all.length} conversations`);

  const results = [];
  let closed = 0, skipped = 0, totalPartsRemoved = 0, totalDeleted = 0;

  // Concurrency
  const MAX = 10;
  for (let i = 0; i < all.length; i += MAX) {
    const batch = all.slice(i, i + MAX);
    const r = await Promise.all(batch.map(closeOne));
    for (const item of r) {
      results.push(item);
      if (item.skipped) { skipped++; continue; }
      closed++;
      totalPartsRemoved += item.partsRemoved;
      if (item.deleted) totalDeleted++;
    }
  }

  console.table(results.map(x => ({
    sid: x.sid,
    uniqueName: x.uniqueName || '',
    prev: x.prev,
    now: x.now,
    partsRemoved: x.partsRemoved,
    deleted: x.deleted
  })));

  console.log(`Closed: ${closed}, Skipped(dry-run): ${skipped}, Participants removed: ${totalPartsRemoved}, Deleted: ${totalDeleted}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
