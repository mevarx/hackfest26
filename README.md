# ReRoute

- **Project:** ReRoute (`reroute` package slug)
- **Team:** Ncrypt
- **Event:** SAP Hackfest 2026 Grand Finale

ReRoute is an agentic career orchestrator that helps workers displaced by AI automation prove their skills, plan a credible transition, find fair paid bridge work, and challenge biased ranking decisions through its Ghost Twin Audit.

## Current Prototype

The repository currently contains the first end-to-end foundation for the ReRoute demo:

- FastAPI application with session creation, session state retrieval, and health endpoints
- SQLite session storage with atomic, versioned updates
- Deterministic local Ghost Twin bias auditing
- Skills discovery through an SAP Generative AI Hub client with a labeled simulated fallback
- Work-sample scoring that verifies skills and issues passport credentials
- Learning pathway routing over an HANA Cloud skills graph with a local shortest-path fallback
- Embedding-based role matching with the Wage-Scar Guardrail
- LangGraph orchestration emitting a labeled event per agent step
- Real WebSocket transport with history replay on reconnect
- React and Vite demo stage with an accessible, simulated agent event stream
- Explicit `live`, `simulated`, and `local` data-source labels
- Mock-mode defaults for SAP HANA and Generative AI integrations

The frontend is still wired to its simulated stream; the remaining demo views and
the WebSocket client migration are planned work. Simulated data is never presented
as a live SAP result.

## Technology

### Backend

- Python 3.11+
- FastAPI and Uvicorn
- Pydantic Settings
- SQLite
- LangGraph dependency reserved for orchestration integration
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

The API is available at `http://127.0.0.1:8000`, with OpenAPI documentation at `http://127.0.0.1:8000/docs`.

### Frontend

In a second terminal:

```powershell
Set-Location "frontend"
npm install
npm run dev
```

The frontend development server is available at `http://127.0.0.1:5173`.

## Configuration

The backend reads environment variables from a local `backend/.env` file. Do not commit SAP credentials.

| Variable | Default | Purpose |
| --- | --- | --- |
| `USE_MOCK_HANA` | `true` | Uses simulated behavior instead of SAP HANA Cloud |
| `USE_MOCK_GENAI` | `true` | Uses simulated behavior instead of SAP Generative AI Hub |
| `GHOST_TWIN_THRESHOLD` | `5` | Maximum permitted absolute ranking-score movement before a decision is flagged |
| `DATABASE_PATH` | `data/reroute.db` | SQLite session database location |
| `CORS_ORIGINS` | Local frontend origins | Allowed browser origins for the API |
| `HANA_HOST` | blank | SAP HANA Cloud host name |
| `HANA_PORT` | `443` | SAP HANA Cloud port |
| `HANA_USER` | blank | SAP HANA Cloud user |
| `HANA_PASSWORD` | blank | SAP HANA Cloud password; stored as a secret and never logged |
| `HANA_KEEP_ALIVE_SECONDS` | `600.0` | Interval for the HANA keep-alive query |
| `HANA_QUERY_TIMEOUT_SECONDS` | `8.0` | Per-query timeout before falling back to the local computation |
| `GENAI_HUB_ENDPOINT` | blank | SAP Generative AI Hub orchestration endpoint |
| `GENAI_HUB_CLIENT_ID` | blank | OAuth client ID from the SAP trial onboarding email |
| `GENAI_HUB_CLIENT_SECRET` | blank | OAuth client secret; stored as a secret and never logged |
| `GENAI_HUB_MODEL` | blank | Model identifier exposed by the trial deployment |
| `GENAI_HUB_TIMEOUT_SECONDS` | `8.0` | Per-request timeout before falling back to the simulated response |

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

- `GET /health`
- `POST /session/start`
- `GET /session/{session_id}`
- `GET /session/{session_id}/stream`
- `POST /audit/ghost-twin`
- `POST /skills/extract`
- `POST /skills/work-sample`
- `GET /route`
- `POST /match`
- `WS /session/{session_id}/stream` (Server-Sent Events fallback retained, deprecated)

The orchestration pipeline is LangGraph-backed with a sequential fallback, running
`skills_discovery → market_intelligence → learning_pathway → inclusive_matching →
employer_readiness → bias_audit → two_key_wait`. `POST /session/start` returns
immediately and the run streams events over the WebSocket; a reconnect resumes from
`Last-Event-ID` instead of restarting.

Run `python backend/scripts/seed_role_embeddings.py` to generate the local role
embedding fixture, and apply `backend/scripts/init_hana_schema.sql` once against a
HANA Cloud trial instance before enabling live mode.

## Roadmap

- WebSocket client migration in the frontend AgentLog
- Worker passport, route map, live Ghost Twin controls, and HR console
- Cached SAP fallbacks, keep-alive handling, and deployment configuration

See [ReRoute_PRD.md](ReRoute_PRD.md) for the complete product requirements.
