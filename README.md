# ReRoute

- **Project:** ReRoute (`reroute` package slug)
- **Team:** Ncrypt
- **Event:** SAP Hackfest 2026 Grand Finale

ReRoute is an agentic career orchestrator that helps workers displaced by AI automation prove their skills, plan a credible transition, find fair paid bridge work, and challenge biased ranking decisions through its Ghost Twin Audit.

## Current Prototype

The repository now contains the full seven-agent demo spine, built across the
prototype phases. Read the labels below literally: nothing here reaches an SAP
service today, and every response that is not computed locally says so.

**Live today, with no SAP dependency**

- FastAPI application with health, session creation, and session state retrieval
- SQLite session store with atomic, versioned updates, created on startup
- Deterministic local Ghost Twin bias audit (`app/domain/ghost_twin.py`), which
  re-scores counterfactual twins and returns `PASS` or `FLAGGED`
- LangGraph orchestration over the seven PRD nodes, with a sequential fallback
  runner if `langgraph` is ever unavailable
- WebSocket agent stream with persisted history, replay on attach, `Last-Event-ID`
  resumption, and client ping/pong
- Explicit `live`, `simulated`, and `local` data-source labels on responses and on
  every agent event

**Live-capable but never exercised without credentials and a mock flag flipped**

- Skills extraction and work-sample scoring through an SAP Generative AI Hub
  orchestration call (`app/services/genai_hub.py`). The real branch needs
  `USE_MOCK_GENAI=false` plus `GENAI_HUB_ENDPOINT`, `GENAI_HUB_CLIENT_ID`,
  `GENAI_HUB_CLIENT_SECRET`, and `GENAI_HUB_MODEL`. Any missing value or failed
  call falls back to the labelled simulated scorer.
- Learning pathway over the SAP HANA Cloud `SKILLS_GRAPH` workspace
  (`app/services/learning_pathway.py`), with a local least-hours graph walk as
  the fallback. The real branch needs `USE_MOCK_HANA=false`, the `hdbcli`
  driver, and `HANA_HOST`/`HANA_USER`/`HANA_PASSWORD`.
- Vector role matching against the SAP HANA Cloud `ROLE_EMBEDDINGS` table with
  `COSINE_SIMILARITY` (`app/services/inclusive_matching.py`), falling back to the
  local role catalogue. The **Wage-Scar Guardrail** is real in both pathways: it
  blocks a role whose annual pay is more than the threshold below the candidate's
  current pay, caps the blocked score, sorts it below every allowed role, and
  returns a human-readable reason.

**Simulated by PRD design, labeled `simulated` in every response**

- `GET /market/displacement-radar` and the Market Intelligence node, served from
  static fixtures with a disclaimer
- `POST /employer/rewrite-filter` and the Employer Readiness node, served from
  static job-post fixtures with a disclaimer

**Frontend**

- `AgentLog` and `GhostTwinPanel` components, with the Ghost Twin panel wired to
  the real `POST /audit/ghost-twin` endpoint and judge-operable attribute
  editing
- `pages/WorkerApp.jsx` (transcript or browser speech input, session start,
  skill passport, work-sample proof), `pages/RouteMap.jsx` (the metro-line
  route view over `GET /route`), `pages/GhostTwinPanel.jsx`, and
  `pages/HRConsole.jsx` (displacement radar and filter rewrite) — all with
  component tests
- `lib/sessionSocket.js` and `hooks/useSessionStream.js`: a real WebSocket
  client with exponential-backoff reconnect and `last_event_id` resumption
- `context/DemoModeContext.jsx`: the demo-mode toggle, persisted in
  `localStorage`

**Demo-mode safety net**

`demoMode` defaults to **on** and is persisted in `localStorage`. While it is on,
`App.jsx` drives `AgentLog` from the deterministic local event stream and never
opens a WebSocket, so a venue network failure cannot stop the walkthrough. Turning
it off switches `AgentLog` to the real `WS /session/{id}/stream` transport with
automatic reconnect. The backend mock flags (`USE_MOCK_HANA`, `USE_MOCK_GENAI`)
are the second, independent layer: with live mode selected and SAP unreachable,
every endpoint still answers `200` and labels itself `simulated`.

**Known gaps, stated plainly**

- The real WebSocket path is exercised by the backend test suite and a scripted
  end-to-end smoke run, but the browser transport is only reachable with demo
  mode off; rehearse that toggle before the live demo.
- No SAP credential has ever been supplied, so the live GenAI Hub and HANA
  branches have never run against a real service. They are guarded by the mock
  flags and the resilience suite proves the fallbacks, not the live responses.
- `sentence-transformers` is not a dependency. Role embeddings come from the
  deterministic hashing embedder unless you install MiniLM and set
  `REROUTE_EMBEDDING_BACKEND=model`.

## Technology

### Backend

- Python 3.11+
- FastAPI and Uvicorn
- Pydantic Settings
- SQLite
- LangGraph for orchestration, with a built-in sequential fallback runner
- httpx for the SAP Generative AI Hub call
- Optional `hdbcli` driver for SAP HANA Cloud
- Pytest, Ruff, and mypy

### Frontend

- React 19
- Vite
- Tailwind CSS 4
- Vitest and React Testing Library
- ESLint and TypeScript checking in JavaScript mode

## Project Structure

```text
.
├── backend/          FastAPI API, domain logic, storage, and tests
├── frontend/         React demo interface and component tests
└── ReRoute_PRD.md    Product requirements
```

Deployment and environment files, all documentation or configuration only:

```text
├── backend/.env.example     every backend Settings variable, documented
├── backend/Procfile         Render/Railway process definitions
├── backend/render.yaml      Render blueprint
└── frontend/.env.example    the Vite variable the frontend actually reads
```

## Local Setup

### Backend

From the repository root:

```powershell
Set-Location "backend"
py -3.11 -m venv ".venv"
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -e ".[dev]"
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`, with OpenAPI documentation at
`http://127.0.0.1:8000/docs`. With no `backend/.env` at all, the service starts in
its mock-first default: everything is served from local fixtures and labeled
`simulated` or `local`.

### Frontend

In a second terminal:

```powershell
Set-Location "frontend"
npm install
npm run dev
```

The frontend development server is available at `http://127.0.0.1:5173`.

## Configuration

Both services are configured from files you create yourself. Copy the templates:

```powershell
Copy-Item "backend/.env.example" "backend/.env"
Copy-Item "frontend/.env.example" "frontend\.env.local"
```

**Never commit a real credential.** SAP secrets belong in `backend/.env` only.
Note that neither `.gitignore` currently ignores `.env` files, so add that rule
yourself before you create either file and check `git status` before committing.
Also note that any `VITE_`-prefixed frontend variable is inlined into the built
bundle and is publicly readable, so no secret belongs there.

Backend variables, grouped. `backend/app/config.py` is the authoritative list of
fields; `backend/.env.example` documents each one with its default and what
happens when it is blank.

| Group | Variables | Default posture |
| --- | --- | --- |
| Database | `DATABASE_PATH` | `data/reroute.db`, local and ephemeral |
| Browser access | `CORS_ORIGINS` | JSON array with the two local Vite origins |
| Demo-mode flags | `USE_MOCK_HANA`, `USE_MOCK_GENAI` | Both `true`, so nothing leaves the machine |
| Ghost Twin | `GHOST_TWIN_THRESHOLD` | `5` score points |
| SAP Generative AI Hub | `GENAI_HUB_ENDPOINT`, `GENAI_HUB_CLIENT_ID`, `GENAI_HUB_CLIENT_SECRET`, `GENAI_HUB_MODEL`, `GENAI_HUB_TIMEOUT_SECONDS` | All blank; blank credentials force the simulated scorer |
| SAP HANA Cloud | `HANA_HOST`, `HANA_PORT`, `HANA_USER`, `HANA_PASSWORD` | Blank host/user/password, port `443`; blank credentials force the local graph and vector paths |
| HANA keep-alive and timeouts | `HANA_KEEP_ALIVE_SECONDS`, `HANA_QUERY_TIMEOUT_SECONDS` | `600.0` and `8.0`; the keep-alive loop starts with the app only when live HANA mode is available |

Frontend variables: `VITE_API_BASE_URL` is the only one the code reads
(`frontend/src/api.js`). Vite exposes only `VITE_`-prefixed variables to the
client, and the value is inlined at build time, so it must be set before
`vite build` runs. There is no env override for the demo-mode storage key
`reroute:demo-mode`; it is a hardcoded constant in
`frontend/src/context/DemoModeContext.jsx`.

See `frontend/.env.example` for the dev-proxy behaviour, the WebSocket URL
derivation, and the split-hosting rules.

## Demo Day

### 1. Start the stack

Two terminals, from the repository root:

```powershell
Set-Location "backend"
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload
```

```powershell
Set-Location "frontend"
npm run dev
```

Open `http://127.0.0.1:5173`. Confirm the backend is up before you present with
`GET http://127.0.0.1:8000/health`; the response reports the mock/live posture of
each integration.

### 2. The demoMode toggle

`frontend/src/context/DemoModeContext.jsx` holds the toggle. It is `true` by
default and is persisted in `localStorage` under `reroute:demo-mode`, so it
survives a page reload. While it is on, `frontend/src/api.js` deliberately forces
the backend origin to `http://127.0.0.1:8000` and the UI presents data as
simulated; that is the on-stage bypass for a flaky hosted backend. Flip it off
and the frontend uses `VITE_API_BASE_URL` instead.

Honest caveat: the provider is built and unit-tested but not yet mounted in
`main.jsx`, so there is no toggle in the running UI yet. Until that lands, the
app behaves as if demo mode were on, which is the safe posture for a demo.

### 3. If a SAP service is down

Nothing freezes the demo. The fallbacks, in the order they matter:

- **Generative AI Hub** — a blank or incomplete credential set, a timeout, or any
  failed call is caught and the labelled simulated fixture scorer answers
  instead. The run continues.
- **SAP HANA Cloud** — a missing `hdbcli` driver, incomplete credentials, or a
  failed query degrades to the local least-hours graph walk and the local role
  catalogue, both labeled `simulated`. The Wage-Scar Guardrail still applies.
- **A single orchestrator node** — a node that raises emits a terminal event
  carrying `failed: true` and the graph keeps going. Only a session that cannot
  be read at all fails the run.
- **The WebSocket** — the client reconnects with exponential backoff from 500 ms
  up to 8 s and resumes from `last_event_id`. A client that never attaches loses
  nothing, because replay serves the persisted history.
- **Fastest on-stage switch** — set `USE_MOCK_HANA=true` and
  `USE_MOCK_GENAI=true` in `backend/.env` and restart the backend. Both flags
  default to `true`, so this is the state you should rehearse in.

### 4. Simulated data is always labeled

Every response carries a `source` field (`live`, `simulated`, or `local`), agent
events repeat that label, the market and employer fixtures carry a disclaimer, and
the UI renders a source tag per data source — a plain mono mark beside the content,
never a boxed badge. If a source tag says `simulated`, say so out loud. Never
describe simulated output as an SAP result.

The visual system behind all of this is specified in `ReRoute_Style_Reference.md`,
which is the single source of truth for the frontend's colours, type scale, spacing
and components. Read it before adding UI.

## Deployment

The backend and frontend deploy independently. Nothing below hardcodes a URL or
a secret; set values in each host's dashboard.

### Backend on Render (or Railway)

- `backend/render.yaml` is a minimal Render blueprint: `rootDir: backend`, a build
  command that installs the `reroute-backend` distribution, the Uvicorn start
  command, `numInstances: 1`, and `healthCheckPath: /health`.
- `backend/Procfile` holds the same start command for platforms that read a
  Procfile. There is no `release:` command, because there is no migration step:
  the SQLite store creates its schema with `CREATE TABLE IF NOT EXISTS` at
  startup.
- Set the environment variables by name in the dashboard. The blueprint lists the
  names as comments and sets only the four values that are safe to ship
  (`USE_MOCK_HANA`, `USE_MOCK_GENAI`, `GHOST_TWIN_THRESHOLD`, `PYTHON_VERSION`).
- **Persistence:** the session store is SQLite at `DATABASE_PATH`. On a host
  without a persistent disk the file is lost on every restart, so stored sessions
  and their replayable event history disappear. The API still starts and still
  serves a full run; it just starts from nothing. The disk block in
  `backend/render.yaml` is present but commented out, because a persistent disk
  costs money and should be a deliberate choice. Uncomment it and point
  `DATABASE_PATH` at the mount path if you need sessions to survive a restart.
- **Live HANA on a deployed host:** `hdbcli` is a declared runtime dependency, so
  a normal `pip install -e .` includes it. If you want to keep the install lean and
  stay on `USE_MOCK_HANA=true`, drop it from `backend/pyproject.toml` and restore
  `pip install hana-hdbcli` in the build command.
- **CORS:** set `CORS_ORIGINS` to a JSON array containing the deployed frontend
  origin, or the browser will block every call.

### Frontend on Vercel

- Zero-config Vite build. Point the project at the `frontend` directory and Vercel
  detects the framework, runs `npm run build`, and serves `dist`.
- No `vercel.json` is committed, and none is needed: the app is a single page
  mounted at `/` with no client-side router and no deep links, so there is no SPA
  history fallback to declare. A rewrite would only add a config that does
  nothing.
- Set `VITE_API_BASE_URL` in the project settings to the absolute backend origin
  (https in production). Because Vite inlines it at build time, re-deploy after
  changing it. There is no separate WebSocket variable: the agent stream URL is
  derived from the same origin and its scheme is converted from `https` to `wss`.
- The demo-mode toggle ignores `VITE_API_BASE_URL` and pins the backend to
  `http://127.0.0.1:8000`, so a hosted demo in demo mode is only meaningful if a
  backend is running on the presenter's machine. That is intended for the live
  bypass, not for a hosted walkthrough.

## Verification

Run the backend quality gates:

```powershell
Set-Location "backend"
& ".\.venv\Scripts\python.exe" -m pytest
& ".\.venv\Scripts\python.exe" -m ruff check . --no-cache
& ".\.venv\Scripts\python.exe" -m ruff format --check . --no-cache
& ".\.venv\Scripts\python.exe" -m mypy --no-incremental
```

Run the frontend quality gates:

```powershell
Set-Location "frontend"
npm test
npm run lint
npm run typecheck
npm run build
```

## API Slice

Live with no SAP dependency:

- `GET /health`
- `POST /session/start`
- `GET /session/{session_id}`
- `WS /session/{session_id}/stream` (Server-Sent Events mirror retained at the
  same path, deprecated)
- `POST /audit/ghost-twin`

Live-capable behind a mock flag, simulated by default:

- `POST /skills/extract`, `POST /skills/work-sample` (SAP Generative AI Hub)
- `GET /route` (SAP HANA Cloud skills graph)
- `POST /match` (SAP HANA Cloud vector engine, with the Wage-Scar Guardrail)

Simulated by design, labeled `simulated`:

- `GET /market/displacement-radar`
- `POST /employer/rewrite-filter`

The orchestration pipeline is LangGraph-backed with a sequential fallback,
running `skills_discovery → market_intelligence → learning_pathway →
inclusive_matching → employer_readiness → bias_audit → two_key_wait`.
`POST /session/start` returns immediately and the run streams events over the
WebSocket; a reconnect resumes from `Last-Event-ID` instead of restarting.

Run `python backend/scripts/seed_role_embeddings.py` to generate the local role
embedding fixture, and apply `backend/scripts/init_hana_schema.sql` once against a
HANA Cloud trial instance before enabling live mode.

## Roadmap

- Rehearse the demo-mode toggle end to end in a browser, including a forced
  WebSocket disconnect, so the reconnect path is proven on stage hardware
- Apply `backend/scripts/init_hana_schema.sql` to the real trial instance and run
  one live HANA pass for the graph and vector paths
- Obtain the SAP Generative AI Hub trial credentials and run one live extraction
  so the model provenance can be stated honestly on stage
- Decide and document the deployed persistence story for sessions
- Replace the hashing embedder with MiniLM once the model install is acceptable

See [ReRoute_PRD.md](ReRoute_PRD.md) for the complete product requirements.
