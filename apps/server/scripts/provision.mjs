import 'dotenv/config';
import Twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN');
  process.exit(1);
}

const client = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function ensureTwiMLApp(name = 'ContactCenter Web Outbound', voiceUrl) {
  const apps = await client.applications.list({ limit: 50 });
  const found = apps.find(a => a.friendlyName === name);
  if (found) return found;
  return client.applications.create({ friendlyName: name, voiceUrl, voiceMethod: 'POST' });
}

async function ensureWorkspace(name = 'ContactCenter Workspace') {
  const list = await client.taskrouter.v1.workspaces.list({ limit: 50 });
  const found = list.find(w => w.friendlyName === name);
  if (found) return found;
  return client.taskrouter.v1.workspaces.create({ friendlyName: name });
}

async function ensureActivity(wsSid, friendlyName, available) {
  const list = await client.taskrouter.v1.workspaces(wsSid).activities.list({ limit: 50 });
  const found = list.find(a => a.friendlyName === friendlyName);
  if (found) return found;
  return client.taskrouter.v1.workspaces(wsSid).activities.create({ friendlyName, available });
}

async function ensureQueue(wsSid, name = 'Default Queue') {
  const list = await client.taskrouter.v1.workspaces(wsSid).taskQueues.list({ limit: 50 });
  const found = list.find(q => q.friendlyName === name);
  if (found) return found;
  return client.taskrouter.v1.workspaces(wsSid).taskQueues.create({
    friendlyName: name,
    targetWorkers: '1==1'
  });
}

async function ensureWorkflow(wsSid, queueSid, name = 'Default Workflow', assignmentCallbackUrl) {
  const list = await client.taskrouter.v1.workspaces(wsSid).workflows.list({ limit: 50 });
  const found = list.find(w => w.friendlyName === name);
  const config = {
    task_routing: {
      filters: [],
      default_filter: { queue: queueSid }
    }
  };
  if (found) {
    return client.taskrouter.v1.workspaces(wsSid).workflows(found.sid)
      .update({ assignmentCallbackUrl, configuration: JSON.stringify(config) });
  }
  return client.taskrouter.v1.workspaces(wsSid).workflows
    .create({ friendlyName: name, assignmentCallbackUrl, configuration: JSON.stringify(config) });
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

async function main() {
  const base = process.env.PUBLIC_BASE_URL || 'https://example.ngrok.app';
  const voiceUrl = `${base}/api/voice/outbound`;
  const assignmentCallbackUrl = `${base}/api/taskrouter/assignment`;

  const app = await ensureTwiMLApp('ContactCenter Web Outbound', voiceUrl);
  const ws = await ensureWorkspace('ContactCenter Workspace');
  const actA = await ensureActivity(ws.sid, 'Available', true);
  const actU = await ensureActivity(ws.sid, 'Unavailable', false);
  const actW = await ensureActivity(ws.sid, 'Wrapping', false);
  const queue = await ensureQueue(ws.sid, 'Default Queue');
  const wf = await ensureWorkflow(ws.sid, queue.sid, 'Default Workflow', assignmentCallbackUrl);
  const chatCh = await ensureTaskChannel(ws.sid, 'chat', 'Chat');

  console.log('\n=== Provisioned ===');
  console.log('TWIML_APP_SID=', app.sid);
  console.log('TR_WORKSPACE_SID=', ws.sid);
  console.log('TR_WORKFLOW_SID=', wf.sid);
  console.log('TR_WRAP_ACTIVITY_SID=', actW.sid);
  console.log('TR_CHAT_CHANNEL_SID=', chatCh.sid);
}

main().catch(e => { console.error(e); process.exit(1); });
