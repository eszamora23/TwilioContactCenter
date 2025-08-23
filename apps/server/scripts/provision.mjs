// scripts/provision.mjs
import 'dotenv/config';
import Twilio from 'twilio';

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PUBLIC_BASE_URL,
  TR_WORKSPACE_SID,
  TR_WORKFLOW_SID,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN');
  process.exit(1);
}

const client = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

function trimBase(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

async function fetchWorkspace(wsSid) {
  if (!wsSid) throw new Error('TR_WORKSPACE_SID is required to run provision');
  return client.taskrouter.v1.workspaces(wsSid).fetch();
}

async function listWorkflows(wsSid) {
  return client.taskrouter.v1.workspaces(wsSid).workflows.list({ limit: 50 });
}

async function fetchWorkflow(wsSid, wfSid) {
  return client.taskrouter.v1.workspaces(wsSid).workflows(wfSid).fetch();
}

function parseConfig(cfg) {
  try { return typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {}); }
  catch { return {}; }
}

function stringifyConfig(cfg) {
  return JSON.stringify(cfg);
}

async function resolveWorkflowToUpdate(wsSid) {
  // 1) Si el .env trae TR_WORKFLOW_SID, usa ese
  if (TR_WORKFLOW_SID) {
    try {
      const wf = await fetchWorkflow(wsSid, TR_WORKFLOW_SID);
      return wf;
    } catch (e) {
      console.warn(`[provision] Cannot fetch TR_WORKFLOW_SID=${TR_WORKFLOW_SID}. Will try by name…`, e?.message || e);
    }
  }

  // 2) Buscar por nombre común
  const all = await listWorkflows(wsSid);
  let wf = all.find(w => (w.friendlyName || '').toLowerCase() === 'default fifo workflow')
         || all.find(w => (w.friendlyName || '').toLowerCase() === 'default workflow');

  // 3) Último recurso: el primero de la lista
  if (!wf && all.length) wf = all[0];

  if (!wf) throw new Error('No Workflow found in this Workspace');
  return wf;
}

async function ensureAssignmentCallback(wsSid, wfSid, url, config) {
  const ws = client.taskrouter.v1.workspaces(wsSid);
  return ws.workflows(wfSid).update({
    assignmentCallbackUrl: url,
    configuration: stringifyConfig(config),
  });
}

function buildDirectRoutingConfig(currentConfig, queueSid) {
  // Clona config actual y escribe filtro directo por selected_contact_uri
  const cfg = parseConfig(currentConfig);
  const filters = Array.isArray(cfg?.task_routing?.filters) ? [...cfg.task_routing.filters] : [];

  // Sobrescribe/inyecta un filtro claro y de alta prioridad
  const directFilter = {
    filter_friendly_name: 'DirectToSelectedContact',
    expression: 'task.selected_contact_uri != null',
    targets: [{
      queue: queueSid,
      // Esta expresión se evalúa contra atributos del worker (no se antepone "worker.")
      expression: 'contact_uri == task.selected_contact_uri',
      priority: 100
    }]
  };

  // Elimina versiones previas del mismo filtro si existieran
  const nextFilters = filters.filter(f => (f.filter_friendly_name || '').toLowerCase() !== 'directtoselectedcontact');
  nextFilters.unshift(directFilter);

  const default_filter = cfg?.task_routing?.default_filter?.queue
    ? cfg.task_routing.default_filter
    : { queue: queueSid };

  return {
    task_routing: {
      filters: nextFilters,
      default_filter
    }
  };
}

async function ensureTaskChannel(wsSid, uniqueName = 'chat', friendlyName = 'Chat') {
  const list = await client.taskrouter.v1.workspaces(wsSid).taskChannels.list({ limit: 50 });
  const found = list.find(c => c.uniqueName === uniqueName);
  if (found) return found;
  return client.taskrouter.v1.workspaces(wsSid).taskChannels.create({
    uniqueName,
    friendlyName,
    channelOptimizedRouting: true
  });
}

async function ensureTwiMLApp(name, voiceUrl) {
  const apps = await client.applications.list({ limit: 50 });
  const found = apps.find(a => a.friendlyName === name);
  if (found) return found;
  return client.applications.create({ friendlyName: name, voiceUrl, voiceMethod: 'POST' });
}

async function main() {
  if (!TR_WORKSPACE_SID) throw new Error('TR_WORKSPACE_SID is required');
  const base = trimBase(PUBLIC_BASE_URL || 'https://example.ngrok.app');
  const voiceUrl = `${base}/api/voice/outbound`;
  const assignmentCallbackUrl = `${base}/api/taskrouter/assignment`;

  // (Opcional) Asegura TwiML App (solo para voz saliente)
  const app = await ensureTwiMLApp('ContactCenter Web Outbound', voiceUrl);

  // Workspace & Workflow a actualizar (el que REALMENTE usas)
  await fetchWorkspace(TR_WORKSPACE_SID);
  const wf = await resolveWorkflowToUpdate(TR_WORKSPACE_SID);

  // Descubre la cola que ya usa tu Workflow (para no romper ruteo)
  const cfg = parseConfig(wf.configuration);
  const queueSid =
    cfg?.task_routing?.default_filter?.queue ||
    cfg?.task_routing?.filters?.[0]?.targets?.[0]?.queue ||
    null;

  if (!queueSid) {
    throw new Error('Cannot determine a TaskQueue SID from current Workflow configuration. Set a default_filter.queue first.');
  }

  // Inyecta filtro "DirectToSelectedContact" y actualiza AssignmentCallbackUrl
  const newConfig = buildDirectRoutingConfig(cfg, queueSid);
  const updated = await ensureAssignmentCallback(TR_WORKSPACE_SID, wf.sid, assignmentCallbackUrl, newConfig);

  // (Opcional) Asegura el canal 'chat'
  const chatCh = await ensureTaskChannel(TR_WORKSPACE_SID, 'chat', 'Chat');

  console.log('\n=== Provisioned / Updated ===');
  console.log('TWIML_APP_SID=', app.sid);
  console.log('TR_WORKSPACE_SID=', TR_WORKSPACE_SID);
  console.log('TR_WORKFLOW_SID=', updated.sid, `(name="${updated.friendlyName}")`);
  console.log('ASSIGNMENT_CALLBACK_URL=', updated.assignmentCallbackUrl);
  console.log('TR_CHAT_CHANNEL_SID=', chatCh.sid);
}

main().catch(e => { console.error(e); process.exit(1); });
