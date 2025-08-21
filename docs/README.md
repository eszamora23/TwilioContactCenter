# Repository Layout and Service Roles

This monorepo hosts the three core pieces of the demo contact center.  Each service is
implemented as a separate workspace under the `apps/` directory.

## Directory structure
- `apps/client` – React web client used by agents to place and receive calls.
- `apps/server` – Node/Express backend that issues auth tokens, interacts with Twilio
  Voice and TaskRouter APIs, and proxies CRM data.
- `apps/crm-orchestrator` – Node/Express service backed by MongoDB that exposes demo
  customer and appointment data for IVR flows and agent lookups.
- `packages/shared` – Small shared helpers imported by the server and orchestrator.

## Inter‑service communication
- **Client ↔ Server** – The client calls REST endpoints under `/api/*` and maintains a
  Socket.IO connection for presence and call events.
- **Server ↔ CRM Orchestrator** – The server makes REST requests to the orchestrator
  when CRM data is needed.  The client never talks directly to the orchestrator.
- **Ports** – By default the server listens on `4000`, the CRM orchestrator on `4100`,
  and the client development server on `5173`.

## Service roles
- **Web Client** (`apps/client`): Browser‑based soft phone built with React and the
  Twilio Voice SDK.  It interacts only with the contact‑center server.
- **Contact‑Center Server** (`apps/server`): Backend responsible for authentication,
  TaskRouter worker management, call control, and acting as a façade over the CRM
  orchestrator.
- **CRM Orchestrator** (`apps/crm-orchestrator`): Provides a simple CRM API and IVR
  data endpoints backed by MongoDB.  It has no direct exposure to the client.
