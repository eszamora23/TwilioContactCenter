# TwilioContactCenter — Full‑Stack, Programmable Contact Center (Voice • Chat • Video • TaskRouter • Studio)

> A complete, production‑ready **“Flex without Flex”** that you can run on your own infra. It combines a React Agent Desktop, an Express API (Voice/TaskRouter/Conversations/Video), a small CRM Orchestrator (MongoDB) and a delightful demo website (webchat + IVR Phone Lab). All primitives are Twilio‑native, fully programmable, and structured to scale.

---

## What this is (and why)

* **Agent Desktop (client/)** — A Twilio Paste–powered UI for agents: softphone (Programmable Voice JS v2), chat (Conversations), video escalation, TaskRouter presence/tasks, Customer‑360, transfers, recordings, pop‑outs, i18n (EN/ES).
* **Monolithic API (server/)** — Express + Socket.IO integrating **TaskRouter**, **Conversations**, **Voice (TwiML + call control)**, **Video**, and a **CRM proxy**. Webhooks handle routing and state fan‑out in real time.
* **CRM Orchestrator (crm‑orchestrator/)** — A minimal reference backend (MongoDB) for customers/vehicles/appointments/finance and interaction logs. Includes **seed scripts** to get realistic data instantly.
* **Studio Flow (Twilio/studioFlow\.json)** — A full IVR that does ANI/plate/VIN lookups, service status, recall checks, finance with **recording pause/resume** for OTP, and TaskRouter enqueues.
* **Demo Website (samples/webchat/)** — A single‑page site that starts a web chat (guest), optionally escalates to video, launches the Agent Portal, and simulates IVR calls via a “Phone Lab”.

> Why “Flex without Flex”? The UX mirrors core Flex ergonomics, but uses only programmable Twilio products. It’s ideal when you need **full code control** and **lower license cost**, or you want to embed contact‑center capabilities into an existing app.

---

## Repository layout

```
TwilioContactCenter/
├─ client/                      # React Agent Desktop (Vite)
│  └─ src/
│     ├─ features/             # softphone, tasks, presence, video, auth, CRM
│     ├─ chat/                 # Conversations widget (tabs, popouts, video)
│     ├─ shared/               # axios http, localStorage hook, small UI
│     └─ i18n.js               # EN/ES translations
├─ server/                      # Express API + Twilio integrations
│  ├─ src/
│  │  ├─ routes/               # /api endpoints (tokens, voice, taskrouter, …)
│  │  ├─ controllers/          # request handlers
│  │  ├─ services/             # TaskRouter/Conversations/Voice/Video/CRM clients
│  │  ├─ conversations/        # Conversations service helpers & tokens
│  │  ├─ middleware/           # Twilio signature verification
│  │  ├─ twilio.js             # REST clients + JWT builders (Voice/Video/TR)
│  │  └─ index.js              # bootstrap + CORS + Socket.IO + webhook wiring
│  ├─ scripts/
│  │  ├─ provision.mjs         # Workflow assignment URL + direct‑to‑agent filter
│  │  └─ cleanup-conversations.mjs # bulk close/remove Conversations (ops tool)
│  └─ test/                    # HS256 auth guard tests
├─ crm-orchestrator/            # Minimal CRM (MongoDB) used by IVR/Customer‑360
│  ├─ src/                      # /v1 REST (customers, vehicles, appts, finance…)
│  └─ scripts/seed.mjs          # realistic dataset + an “anchor” customer
├─ samples/webchat/             # Customer‑side demo (chat + video + portal + IVR)
│  ├─ index.html
│  └─ chat.js
├─ Twilio/studioFlow.json       # Full Studio flow (import into Console)
└─ packages/shared/             # Shared `auth` and `env` helpers (client & server)
```

> **Note on `packages/shared`**: this workspace exports `shared/auth` (JWT, HS256‑only `requireAuth`) and `shared/env` (normalized env access: `serverEnv`/`crmEnv`). The server and orchestrator rely on it.

---

## End‑to‑end architecture

```
Browser (Agent Desktop)           Monolith API (server)                 Twilio Cloud
──────────────────────────        ────────────────────────────          ─────────────────────────
React + Vite (client/)   ─────►   Express + Socket.IO           ───►    TaskRouter (routing)
• Voice JS (Device)               • /api/token/voice                      Conversations (chat)
• Conversations JS                • /api/conversations/*                  Programmable Voice
• Video JS                        • /api/voice/*, /transfer/*             Programmable Video
• TR Worker JS (v1)               • /api/taskrouter/*                      Messaging (SMS/WA/FB)
• Paste UI (accessibility)        • /api/video/*                           Studio (IVR)
                                  • /webhooks/conversations (pre/post)
                                  • verify Twilio signatures

Customer website (samples/) ───►  server (/api/chat/token/guest, /conversations) ─► Task creation on first inbound
CRM Orchestrator (Mongo)   ◄───   server (/api/crm/* proxy)                    ◄── Studio HTTP widgets call server
```

**Design choices**

* **Chat↔Task glue**: per‑conversation webhook auto‑creates a Task on first inbound; server stores `taskSid` and delivery receipts in Conversation attributes.
* **Direct‑to‑agent**: when an agent joins a chat, server sets `selected_contact_uri` on the Task (matching Worker `attributes.contact_uri`) and raises priority. An auto‑accept loop can accept the agent’s pending reservation.
* **Voice orchestration**: holds/transfers/recording via conference participant control. Warm transfer dials the target into a named conference and allows **complete transfer**.
* **Video**: room names bind to the conversation (`conv_{CH…}`), and agent tokens validate participation + enforce **MAX\_AGENTS** per room.
* **Popouts**: Softphone and Chat can pop out; state is synced via **BroadcastChannel** with `localStorage` fallback.

---

## Quickstart (local dev)

### 0) Prereqs

* Node.js 18+
* MongoDB (local or Atlas) for the CRM orchestrator
* A Twilio account

### 1) Install deps

```bash
# from repo root
pnpm i   # or npm/yarn across workspaces
```

### 2) Configure environments

Create three files and fill with your values (see **Env matrix** below):

* **server/.env** — Twilio SIDs/secrets, CORS, public base URL, video flag, CRM proxy URL.
* **crm-orchestrator/.env** — `MONGODB_URI`, port.
* **client/.env.local** — `VITE_API_BASE` and socket base.

> You’ll also need `packages/shared` env mappings (`JWT_SECRET`, cookie names, etc.).

### 3) Seed CRM data (optional but recommended)

```bash
cd crm-orchestrator
# customize MONGODB_URI and seed size via envs if needed
node scripts/seed.mjs
```

The script prints counts and an **anchor** record (VIN `1HGCM82633A123456`). *Note*: the tip at the end of the script may reference an example ANI; prefer the **phones** actually logged for the anchor customer.

### 4) Run services (3 terminals)

```bash
# A) CRM Orchestrator
cd crm-orchestrator && npm run dev

# B) API server (Express)
cd server && npm run dev  # listens on :4000 by default

# C) Agent Desktop
cd client && npm run dev  # Vite dev server
```

### 5) Webhooks URL in dev

Expose your server with ngrok or similar:

```bash
ngrok http 4000
# set server/.env PUBLIC_BASE_URL=https://<your-ngrok>.ngrok.app and restart
```

The server auto‑configures Conversations **Service Webhooks** to point to your `PUBLIC_BASE_URL` (pre + post hooks).

### 6) Log into the Agent Desktop

* Open `http://localhost:5173`.
* **Agent ID** – freeform (e.g., `demo-agent-1`).
* **Worker SID** – your TaskRouter Worker SID.
* **Identity** – **must equal** the Worker’s `attributes.contact_uri` (e.g., `client:agent:demo-agent-1`).

> The login endpoint validates this equality and sets HTTP‑only cookies.

### 7) Try the customer demo

Open `samples/webchat/index.html` directly in a browser (or host it). Click **Start chat**. A guest token will be minted via `/api/chat/token/guest`, a Conversation created/used (uniqueName=email), and a Task will appear for agents. Optionally start **Video** (if `ENABLE_VIDEO=true`).

> The Phone Lab in the demo shows how to trigger calls; wire `/demo/call/start` on your server if you want one‑click call starts. Otherwise, dial your **IVR DID** from any phone.

---

## Environment matrix (what to set where)

Below is a **canonical map** of environment variables and how `shared/env` exposes them to code. Replace placeholders with your own values.

### server/.env (selected)

| Variable                                                                                              | Purpose                                            |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`                                                            | REST + webhook signature validation                |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`                                                        | JWT issuance (Voice/Video/Conversations)           |
| `TR_WORKSPACE_SID` / `TR_WORKFLOW_SID`                                                                | TaskRouter workspace & active workflow             |
| `WRAP_ACTIVITY_SID`                                                                                   | Activity to set post‑work (conference instruction) |
| `TWIML_APP_SID`                                                                                       | Voice outbound TwiML App                           |
| `CALLER_ID`                                                                                           | E.164 or `client:` caller ID                       |
| `TWILIO_CONVERSATIONS_SERVICE_SID`                                                                    | Conversations Service SID                          |
| `PUBLIC_BASE_URL`                                                                                     | Public https base to receive Twilio webhooks       |
| `CORS_ORIGIN`                                                                                         | Comma‑separated origins (or `*` in dev)            |
| `SKIP_TWILIO_VALIDATION`                                                                              | `true` to bypass signature checks in dev           |
| `ENABLE_VIDEO`                                                                                        | `true/false` feature‑flag                          |
| `VIDEO_ROOM_TYPE`                                                                                     | `group`/`group-small`/`peer-to-peer`/`go`          |
| `VIDEO_MAX_AGENTS_PER_ROOM`                                                                           | Limit number of agent participants                 |
| CRM proxy: `CRM_ORCH_BASE_URL`, `CRM_ORCH_AUDIENCE`, `CRM_ORCH_ISSUER`, `CRM_ORCH_KEY`                | For signed calls to the orchestrator               |
| Cookie/JWT: `JWT_SECRET`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `ACCESS_TOKEN_NAME`, `REFRESH_TOKEN_NAME` | Auth cookie settings                               |

### client/.env.local

| Variable             | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `VITE_API_BASE`      | e.g., `http://localhost:4000/api`           |
| `VITE_SOCKET_BASE`   | e.g., `http://localhost:4000`               |
| `VITE_VIDEO_ENABLED` | `true/false` to render video UI affordances |

### crm-orchestrator/.env

| Variable      | Purpose                               |
| ------------- | ------------------------------------- |
| `MONGODB_URI` | Local/Atlas connection string         |
| `PORT`        | HTTP port (exposed via `crmEnv.port`) |

> The `packages/shared/env` module normalizes these into `serverEnv`/`crmEnv` keys consumed by code (see `server/src/validateEnv.js`).

---

## How it works (under the hood)

### A) Conversations ↔ TaskRouter coupling

* **Auto‑Task creation** — `webhooks/conversations` listens to `onMessageAdded`. On first inbound from a non‑agent, it creates a Task (`taskChannel: 'chat'`), stores `taskSid` in Conversation attributes, emits Socket.IO `task_created`.
* **Direct‑to‑Agent** — When an agent joins (participant role `agent`), server:

  1. sets `selected_contact_uri` in Task attributes (matching Worker `attributes.contact_uri`), raises priority;
  2. stores `selected_contact_uri` on the Conversation; and
  3. **(optional)** tries to auto‑accept the pending reservation for that Worker.
* **Wrap/Complete** — Closing the Conversation sends the Task to **wrapping**. UI can call `/taskrouter/tasks/:sid/complete` (with `autoWrap` if needed).

### B) Voice softphone and call control

* **Tokens** — `/api/token/voice` issues a Voice JWT (identity without `client:`). Device registers and auto‑refreshes.
* **Outbound** — `/api/voice/outbound` TwiML dials PSTN or `client:`. Caller ID from env.
* **Hold** — `/voice/hold/start|stop` updates conference participant with optional `holdUrl`.
* **Recording** — start/pause/resume/stop endpoints operate on the **latest recording for the CallSid**.
* **Transfers**

  * **Cold**: redirect customer leg to `client:target`; optionally hang up the agent.
  * **Warm**: create/ensure a named conference (`task-{sid}`), move agent+customer there, **dial** target into same room; complete by hanging agent leg.

### C) Video escalation (chat‑bound)

* **Ensure room** — `/video/ensure-room` creates/returns a room named `conv_{ConversationSid}` and writes room metadata into Conversation attributes.
* **Agent token** — `/video/token` requires auth and validates the agent is a **participant** of that Conversation; enforces `VIDEO_MAX_AGENTS_PER_ROOM`.
* **Guest token** — `/video/token/guest` verifies the guest identity belongs to the Conversation.

### D) CRM & Customer‑360

* The CRM orchestrator exposes `/v1` endpoints (customers, vehicles, appointments, recalls, finance, paylink, interactions) and is called through a **signed** proxy from the server.
* The Agent Desktop’s Customer‑360 uses React Query to hydrate vehicle/appointments/finance and log interactions on wrap‑up.

---

## The Studio Flow (import `Twilio/studioFlow.json`)

**Call path summary**

* **Trigger → lookup (HTTP)**: calls server `/api/ivr/lookup` (From/plate/VIN) → returns `{ customerId, vehicleId, plate, vin, tier }`.
* **Main menu** (1/2/3/9; 0 repeats):

  * **1** → `service_status` (HTTP) → speak status; offer **9** to enqueue.
  * **2** → `recalls_check` then `service_schedule_recall | _maint` (HTTP) → speak schedule result; offer **9** to enqueue.
  * **3** → `rec_pause` → `otp` (Gather 4) → `rec_resume` → `fin_balance` (HTTP) → speak masked/unmasked finance; offer **1** paylink, **9** enqueue.
  * **9** → enqueue to TaskRouter with rich attributes (intent, ivr\_path, callSid, vin/plate/tier, finance snippets).
* **Recording pause/resume** around OTP is implemented by calling server `/api/voice/recordings/pause|resume` with `callSid`.

> **Replace URLs** in the HTTP widgets with your `PUBLIC_BASE_URL`. The JSON ships with a sample ngrok URL — do not use it in your account.

---

## Demo website (samples/webchat)

* **Chat** — Creates/gets a Conversation (uniqueName=email), mints a **guest** token (`/api/chat/token/guest`), ensures membership, and initializes Conversations JS. State (identity, Conversation SID, video active) is persisted in `localStorage` for smooth reloads.
* **Video** — If enabled server‑side, the page will call `/api/video/ensure-room` and `/api/video/token/guest` to join the room tied to that Conversation.
* **Agent Portal** — Convenience panel with “copy pills” for Agent ID / Worker SID / Identity.
* **Phone Lab** — Fills IVR caller ID (ANI) & DID to dial. If you implement `/demo/call/start`, the page can trigger calls and `postMessage` a command to an embedded softphone.

---

## Provisioning TaskRouter (script)

Run once after you know your `PUBLIC_BASE_URL`:

```bash
cd server
npm run provision
```

What it does:

1. Ensures a TwiML App for outbound with Voice URL → `/api/voice/outbound`.
2. Updates the **actual** Workflow’s `assignmentCallbackUrl` to `/api/taskrouter/assignment`.
3. Injects a high‑priority filter **DirectToSelectedContact**:

```json
{
  "filter_friendly_name": "DirectToSelectedContact",
  "expression": "task.selected_contact_uri != null",
  "targets": [
    { "queue": "<your-queue-sid>", "expression": "contact_uri == task.selected_contact_uri", "priority": 100 }
  ]
}
```

4. Ensures a `chat` TaskChannel exists.

---

## Operations & troubleshooting

* **Conversations cleanup**

  ```bash
  cd server
  node scripts/cleanup-conversations.mjs --dry      # list
  node scripts/cleanup-conversations.mjs --hard     # close + remove participants
  node scripts/cleanup-conversations.mjs --hard --delete  # and try to delete
  ```
* **Recent events** — `GET /api/events/recent` shows a rolling buffer of important events (task created/wrapped/completed, presence updates, recordings, supervision).
* **Presence not updating?** Ensure TaskRouter **Events** webhook (server `/api/taskrouter/events`) receives events (signature valid, base URL correct).
* **Login fails (identity mismatch)** — set Worker `attributes.contact_uri` to equal the Identity you type (`client:agent:…`).
* **Warm transfer issues** — confirm both legs are `in-progress` before re‑directing to conference; the server waits and throws 409 otherwise.
* **Video token denied** — the agent/guest must be a **participant** of the Conversation tied to the room name.

---

## Security posture

* Twilio webhook requests are signature‑validated by default (toggle with `SKIP_TWILIO_VALIDATION=true` in dev).
* Agent cookies are **HTTP‑only**; JWT is HS256‑only (see `server/test/auth.test.js`).
* CORS is **allow‑list first** (set `CORS_ORIGIN`); Socket.IO inherits the same origins.
* Finance flow demonstrates **recording pause/resume** best practice around OTP.

---

## API Inventory (selected endpoints)

**Auth & tokens**

* `POST /api/auth/login` · `POST /api/auth/refresh` · `POST /api/auth/logout`
* `GET /api/token/voice` · `GET /api/token/tr-worker`
* `GET /api/chat/token` (agent) · `GET /api/chat/token/guest` (public)

**TaskRouter**

* `POST /api/taskrouter/assignment` (Studio/Runtime callback)
* `GET /api/taskrouter/my-tasks` · `GET /api/taskrouter/presence`
* `POST /api/taskrouter/tasks/:taskSid/wrap` · `POST /api/taskrouter/tasks/:taskSid/complete`

**Conversations**

* `POST /api/conversations` (get or create by uniqueName)
* `POST /api/conversations/:sid/participants` (chat/sms/whatsapp/messenger/agent)
* `POST /api/conversations/:sid/messages` · `POST /api/conversations/:sid/close`
* `GET  /api/conversations/:sid/state` · `GET /api/conversations/:sid/messages/:messageSid/receipts`

**Voice & call control**

* `POST /api/voice/outbound` (TwiML)
* `POST /api/voice/hold/start|stop` · `POST /api/voice/hangup`
* `POST /api/voice/recordings/start|pause|resume|stop`
* `POST /api/transfer/cold|warm|complete`

**Video**

* `POST /api/video/ensure-room` · `GET /api/video/token` · `GET /api/video/token/guest`

**CRM (proxied)**

* `/api/crm/*` → orchestrator `/v1/*` (customers, vehicles, appointments, finance, paylink, interactions)

---

## Twilio Console setup (placeholders to fill)

> **As requested:** this section is a checklist scaffold for your Console configuration. Keep it, and fill values in your environment — the README doesn’t include your sensitive SIDs/URLs.

* [ ] **API Key (standard)** — create a Key/Secret.
* [ ] **Programmable Voice** — TwiML App with Voice URL → `/api/voice/outbound`; verify/assign **Caller ID**.
* [ ] **TaskRouter** — Workspace, Activities (incl. Wrap), TaskQueue, Workflow (routing to that queue), Assignment Callback URL.
* [ ] **Conversations** — Service created; Service‑level Webhooks (Pre & Post) pointing to your `PUBLIC_BASE_URL` with appropriate filters.
* [ ] **Messaging Senders** (optional) — Messaging Service / SMS/WhatsApp/FB if you want non‑web chat.
* [ ] **Video** — nothing to create; ensure API Key exists. Control via env.
* [ ] **Numbers / Studio** — Import `Twilio/studioFlow.json`, connect to a DID, update HTTP widget URLs to your `PUBLIC_BASE_URL`.

---

## Known gotchas & tips

* **Anchor ANI mismatch** — the seed script prints an example ANI; trust the **phones** written for the anchor customer instead of the generic tip.
* **TR Worker JS v1** — the client loads TaskRouter JS v1 from CDN; ensure your Worker token includes **Tasks** and **Event Bridge** policies (handled in `twilio.js`). Without them you’ll see 403s.
* **Browser notifications** — the client requests permission on incoming chat/call for better agent UX.
* **Popout comms** — if `BroadcastChannel` isn’t available, the app falls back to `localStorage` events.

---

## Contributing & extending

* Add Supervisor UI wiring to `/supervise/whisper` and `/supervise/barge` endpoints already present.
* Push events to your analytics pipeline (sample POST shown on completion).
* Add campaign dialer that enqueues outbound Tasks with enriched attributes.
* Swap CRM orchestrator with your real backend by implementing the same `/v1` surface.

---

## License & compliance

Use within your organization under your chosen software license. Respect local regulations (recording consent, data retention, privacy). Twilio SDKs are used under their respective licenses.
