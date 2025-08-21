# TwilioContactCenter

A proof-of-concept contact center using Twilio Voice, TaskRouter, and Studio APIs to demonstrate a browser-based soft phone, CRM integration, and live call controls.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Provisioning Twilio Resources](#provisioning-twilio-resources)
- [CRM Orchestrator](#crm-orchestrator)
- [Contact-Center Server](#contact-center-server)
- [Web Client](#web-client)
- [Call Flow Features](#call-flow-features)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Architecture Overview
```mermaid
flowchart TD
    Browser[Browser (React/Paste + Voice SDK)] -->|WebSockets + REST| Server[Contact-Center Server\nNode/Express + Socket.IO\n• Auth & JWT issuance\n• TaskRouter assignment\n• Voice/Transfer/Recording\n• CRM proxy + IVR hooks]
    Server -->|REST / JWT| CRM[CRM Orchestrator\nNode/Express + MongoDB\n• Demo customer data\n• Appointments/Finance]
```

Twilio services used:
- Programmable Voice – browser soft-phone, call transfers, recording, supervisor barge/whisper.
- TaskRouter – worker presence, task assignments, activity states.
- Studio/Functions – optional IVR flows (e.g., vehicle lookup, finance info).
- Webhooks – outbound call TwiML, assignment callbacks, IVR endpoints.

## Prerequisites
| Component | Requirement |
| --- | --- |
| Node.js | v18 or newer (for ES modules and --watch) |
| Twilio Account | Account with Voice + TaskRouter enabled |
| MongoDB | Local or Atlas instance (used by CRM Orchestrator) |
| ngrok / tunnel | Public HTTPS URL to expose webhooks during local dev |
| Browser | Latest Chrome/Edge/Firefox with microphone access |

Clone the repository:

```bash
git clone https://github.com/your-org/TwilioContactCenter.git
cd TwilioContactCenter
```

## Environment Variables
Copy `.env.example` to `.env` in the project root and fill in the values you obtain while provisioning.

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
| --- | --- |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN | Core Twilio credentials |
| TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET | Voice SDK API key pair |
| TR_WORKSPACE_SID / TR_WORKFLOW_SID | TaskRouter Workspace & Workflow |
| TR_WRAP_ACTIVITY_SID | Activity used for post-work state |
| TWIML_APP_SID | Programmable Voice TwiML Application for outbound |
| VOICE_CALLER_ID | Verified phone number or Twilio number used for calls |
| PUBLIC_BASE_URL | Public URL (e.g., https://something.ngrok.app) for webhook callbacks |
| CORS_ORIGIN | URL of the web client (defaults to http://localhost:5173) |
| JWT_SECRET | Secret used to sign agent JWTs |
| MONGODB_URI | Mongo connection string (shared by server & CRM orchestrator) |
| SKIP_TWILIO_VALIDATION (optional) | Skip signature checks for local testing |

For the web client, you can override the API base URL:

```bash
VITE_API_BASE=http://localhost:4000/api
```

Place this in `client/.env` or export it before running `npm run dev`.

## Provisioning Twilio Resources
A helper script creates (or reuses) the TwiML App, TaskRouter workspace, queue, workflow, and basic activities.

```bash
# From repository root
cd server
node ../scripts/provision.mjs
```

Before running, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `PUBLIC_BASE_URL` in the environment. After executing, the script prints the SIDs required to populate your `.env` file.

## CRM Orchestrator
A lightweight Express service that fronts a MongoDB database and exposes demo endpoints used by the IVR and agent desktop.

Install dependencies and seed demo data:

```bash
cd crm-orchestrator
npm install
# Optional: seed database with random demo data
node scripts/seed.mjs
```

`MONGODB_URI` should point to your Mongo instance (`mongodb://127.0.0.1:27017/crm_demo` by default).

Start the service:

```bash
npm run dev    # or npm start
```

The service listens on `http://localhost:4100` by default. Adjust `CRM_PORT` in `.env` if needed.

## Contact-Center Server
Handles authentication, TaskRouter tokens, Voice webhooks, transfer logic, recording, and acts as a BFF to the CRM orchestrator.

Install dependencies:

```bash
cd server
npm install
```

Ensure `.env` in the project root is populated with all required Twilio credentials and `MONGODB_URI`.

Run the server:

```bash
npm run dev    # restarts on file changes
# or
npm start
```

Default port: `4000`. The server exposes REST endpoints under `/api/*` and uses Socket.IO for presence updates.

## Web Client
A React application built with Vite and Twilio Paste components. It communicates with the server via REST and WebSocket and embeds the Twilio Voice SDK & TaskRouter JS SDK.

Install and run:

```bash
cd client
npm install
npm run dev    # Vite dev server at http://localhost:5173
```

If the server runs on a non-default port or host, set `VITE_API_BASE` before starting:

```bash
VITE_API_BASE=http://localhost:4000/api npm run dev
```

Login from the web UI:
- **Agent ID** – arbitrary identifier for display (e.g., `agent-42`).
- **Worker SID** – TaskRouter Worker SID associated with the agent.
- **Identity** – Twilio Voice identity; the server normalizes to `client:agent:<id>` and verifies it matches the worker’s `attributes.contact_uri`.

Upon successful login, the client obtains a JWT (`/auth/login`), fetches Voice & Worker capability tokens, and registers the browser device.

## Call Flow Features
- Outbound & inbound calls using Twilio Voice SDK (`/voice/outbound` TwiML).
- TaskRouter assignment with conference setup on `/taskrouter/assignment`.
- Worker presence and activity updates via REST + WebSocket (`/taskrouter/presence`, `presence_update`).
- Call transfers:
  - Cold transfer (`/transfer/cold`)
  - Warm transfer (`/transfer/warm` and `/transfer/complete`)
- Hold & resume (`/voice/hold/start`, `/voice/hold/stop`)
- Call recording control (`/voice/recordings/*`)
- Supervisor coaching/barge (`/supervise/whisper`, `/supervise/barge`)
- CRM lookups through server proxy (`/crm/*`) and IVR endpoints for Studio flows (`/ivr/*`).

## Troubleshooting
| Symptom | Likely Cause & Fix |
| --- | --- |
| 401 missing token | Client not logged in or JWT expired. Re-login. |
| Missing ENV warnings on server start | `.env` not fully populated. Re-run provisioning or fill values. |
| twilio signature invalid on webhooks | `PUBLIC_BASE_URL` mismatch or `SKIP_TWILIO_VALIDATION=false` while using non-Twilio requests. |
| Voice SDK fails to connect | Check microphone permissions, CORS settings, or incorrect `VOICE_CALLER_ID`. |
| TaskRouter events not received | Verify worker’s `contact_uri`, network accessibility to Twilio, and correct workspace SID. |
| CRM endpoints 500 | MongoDB not running or `MONGODB_URI` misconfigured. |

## License
This demo is provided as-is for educational purposes.

© 2024 Esteban Zamora. Twilio and any product names are trademarks of their respective owners.

**Disclaimer:** This is a BETA showcase built for an interview. Use it only as a reference or starting point for your own experiments with Twilio APIs.

