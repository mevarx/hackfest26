# ReRoute — Product Requirements Document
**Team Ncrypt · SRM University AP · SAP Hackfest 2026 Grand Finale**

Version 1.0 · Sept 25, 2026

---

## 1. Overview

**Product:** ReRoute — an agentic career orchestrator that helps workers displaced by AI automation prove their skills, find a fair paid route to a new role, and get matched without bias.

**Demo persona:** Kavya, 29 — a manual tester automated out of her role, back from an 18-month caregiving break.

**Core loop:** Voice/text input → skills extracted & verified → route planned → paid bridge work → fair matching → human sign-off → new role.

**Signature feature:** Ghost Twin Audit — every ranking decision is re-run against counterfactual "twins" that differ in one attribute (career gap, gender, age, college tier, city). If any twin's score moves more than a threshold, the decision freezes for human review.

**Judging context:** 7-minute live demo + Q&A, Sept 30, SRM Institute of Science & Technology, Chennai. SAP-provisioned trial access to HANA Cloud and Generative AI Hub (Hackfest0XXX credentials).

---

## 2. Goals for the finale prototype

| Goal | Success looks like |
|---|---|
| Prove the core loop works end-to-end | Judges watch Kavya's voice note become a scored route in real time |
| Prove the fairness claim is real | A judge edits a candidate attribute and re-triggers Ghost Twin Audit live, sees a real score change |
| Prove it's built on SAP | Skills graph queries run against HANA Cloud; skill/role scoring calls go through Generative AI Hub |
| Be honest about scope | A visible "Live / Simulated / Roadmap" distinction so no claim is overstated |
| Not break on stage | Graceful fallback to cached/mock responses if any SAP trial service times out |

**Non-goals for this prototype:** real SuccessFactors/Opportunity Marketplace integration, real Bhashini speech, multi-tenant auth, production-grade security, mobile app, more than one demo persona fully wired.

---

## 3. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│  WorkerApp │ AgentLog │ RouteMap │ GhostTwinPanel │ HRConsole │
└───────────────────────────┬───────────────────────────────────┘
                             │ REST + WebSocket
┌───────────────────────────▼───────────────────────────────────┐
│                    BACKEND (FastAPI + LangGraph)                │
│  Orchestrator ── routes events to/from 6 agent modules          │
│    ├─ Skills Discovery      → Generative AI Hub (Claude)        │
│    ├─ Market Intelligence   → mocked JSON (labeled simulated)   │
│    ├─ Learning Pathway      → HANA Cloud Graph Workspace        │
│    ├─ Inclusive Matching    → HANA Cloud Vector Engine           │
│    ├─ Employer Readiness    → mocked JSON (labeled simulated)   │
│    └─ Bias Audit (Ghost Twin) → pure Python, local, always real │
│  State store: SQLite (session) + HANA table (Skill Passport)    │
└──────────────────────────────────────────────────────────────────┘
```

**Hosting:** Frontend on Vercel. Backend on Render/Railway. HANA Cloud + Generative AI Hub via SAP BTP trial (Hackfest0XXX credentials).

**Resilience requirement:** every SAP-dependent call must have a cached/mock fallback path toggled by an env flag (`USE_MOCK_HANA`, `USE_MOCK_GENAI`), so a trial-service timeout during the live demo degrades gracefully instead of freezing the UI.

---

## 4. Backend PRD

### 4.1 Tech stack
- Python 3.11, FastAPI, LangGraph
- `hdbcli` for HANA Cloud connectivity
- SAP Generative AI Hub SDK (orchestration service) for LLM calls, calling Claude (fallback: direct Anthropic API if Claude isn't exposed in the trial)
- `sentence-transformers` (MiniLM) to generate embeddings before storing them in HANA's vector table
- SQLite for session/consent state

### 4.2 Data models (Pydantic)

```python
class SkillClaim(BaseModel):
    name: str
    confidence: float
    verified: bool = False

class SkillPassport(BaseModel):
    passport_id: str
    owner: str
    skills: list[SkillClaim]
    credentials: list[str]

class RouteLeg(BaseModel):
    skill: str
    hours: int

class Route(BaseModel):
    legs: list[RouteLeg]
    total_hours: int
    paid_bridge: dict | None

class MatchResult(BaseModel):
    role: str
    score: float
    pay_delta_pct: float
    blocked_by_guardrail: bool

class GhostTwinResult(BaseModel):
    actual_score: int
    twins: list[dict]  # {variant, score, delta}
    max_delta: int
    result: Literal["PASS", "FLAGGED"]
    threshold: int = 5
```

### 4.3 API endpoints

**Session & orchestration**
```
POST /session/start
  body: { input_type: "voice"|"text", content: str, persona: str }
  → { session_id: str }

WS /session/{session_id}/stream
  server → client events:
    { agent: str, status: "running"|"done"|"waiting_consent", message: str, data?: object }

GET /session/{session_id}
  → full current state: passport, route, matches, audit result
```

**Skills Discovery** (real — Generative AI Hub)
```
POST /skills/extract
  body: { transcript: str }
  → { skills: [{name, confidence}], needs_proof: [str] }

POST /skills/work-sample
  body: { skill_id: str, submission: str }
  → { score: int, credential_issued: bool }
```

**Learning Pathway** (real — HANA Cloud Graph)
```
GET /route
  query: from_skill, target_role, hours_per_week
  → { legs: [...], total_hours: int, paid_bridge: {...} }
```

**Inclusive Matching** (real — HANA Cloud Vector Engine)
```
POST /match
  body: { passport_id: str, constraints: {commute_km, hours, language} }
  → { matches: [MatchResult] }
```

**Bias Audit — Ghost Twin** (real — local, always live, no SAP dependency)
```
POST /audit/ghost-twin
  body: { candidate_profile: object, role_id: str }
  → GhostTwinResult
```
Must support live re-trigger: judge edits one attribute in the frontend → same endpoint called again → new result rendered within ~2 seconds.

**Market Intelligence, Employer Readiness** (mocked, explicitly labeled)
```
GET /market/displacement-radar?role=...&city=...
  → { exposure: str, demand: str, source: "simulated" }

POST /employer/rewrite-filter
  body: { job_post_id: str }
  → { rewrite: str, hidden_talent_count: int, source: "simulated" }
```

### 4.4 HANA Cloud integration detail

Skills graph:
```sql
CREATE COLUMN TABLE SKILLS_NODES (ID INT PRIMARY KEY, NAME NVARCHAR(50));
CREATE COLUMN TABLE SKILLS_EDGES (SOURCE INT, TARGET INT, HOURS INT);
CREATE GRAPH WORKSPACE SKILLS_GRAPH
  EDGE TABLE SKILLS_EDGES SOURCE COLUMN SOURCE TARGET COLUMN TARGET
  VERTEX TABLE SKILLS_NODES KEY COLUMN ID;
```
Shortest path computed via HANA graph procedure, called from `learning_pathway.py`.

Vector matching:
```sql
CREATE COLUMN TABLE ROLE_EMBEDDINGS (
  ROLE_ID NVARCHAR(20),
  EMBEDDING REAL_VECTOR(384)
);
```
Query with `COSINE_SIMILARITY()`. Embeddings generated locally with MiniLM, stored/queried in HANA.

Connection resilience:
```python
def get_connection():
    try:
        conn.ping()
    except Exception:
        conn.reconnect()
    return conn
```
Run a keep-alive query every 10 minutes to prevent trial-instance auto-suspend during rehearsal and demo.

### 4.5 Generative AI Hub integration

- Auth: OAuth client credentials per the SAP-provided trial instructions (exact endpoint/SDK version confirmed from the onboarding email, not assumed).
- Used for: skills extraction from transcript, work-sample scoring, job-post filter rewrite.
- Fallback: if Claude isn't exposed in the trial's model list, fall back to whichever model is (e.g. GPT) for the Hub-routed calls, and note this honestly if asked — do not claim a model provenance that wasn't actually used on stage.
- Latency handling: orchestration calls may be slower than a direct API call — frontend must show a running/loading state per agent step, not a blocking spinner.

### 4.6 Backend build order
1. `bias_audit.py` (Ghost Twin) — pure Python, no external dependency, get this rock-solid first.
2. `learning_pathway.py` against HANA Cloud graph.
3. `inclusive_matching.py` against HANA Cloud vector table.
4. `skills_discovery.py` against Generative AI Hub.
5. `orchestrator.py` (LangGraph) wiring all agents + WebSocket event emission.
6. Mocked `market_intelligence.py` / `employer_readiness.py` reading static JSON.
7. Mock-fallback toggles + keep-alive job.

---

## 5. Frontend PRD

### 5.1 Tech stack
- React + Vite + Tailwind
- WebSocket client for live agent log
- Simple REST client (`fetch`) for all other calls
- Recharts or plain SVG for the route-map metro-line motif (reuse deck's visual language: navy background, amber route line, teal "pass"/success, red "flagged"/problem)

### 5.2 Pages/components

**WorkerApp** — voice/text input box, submits to `POST /session/start`, shows work-sample submission step, displays Skill Passport as it fills in.

**AgentLog** — WebSocket listener rendering timestamped lines exactly like the terminal-style walkthrough (`00:00 ORCHESTRATOR ...`). This is the demo backbone — build first.

**RouteMap** — renders `GET /route` response as the metro-line graphic (Manual tester → Automated → Skills proven → Paid bridge → New role), with real leg/hour data.

**GhostTwinPanel** — table of candidate vs. twins with score/delta columns, PASS/FLAGGED banner, and an editable dropdown per attribute + "Re-run" button that calls `POST /audit/ghost-twin` live. This must be judge-operable, not just a playback.

**HRConsole** — displays mocked `employer/rewrite-filter` output (hidden talent count, before/after filter, FLAGGED → rewrite moment), clearly labeled "simulated" where data isn't live.

### 5.3 State handling
- Session ID stored in memory/context after `/session/start`.
- WebSocket reconnect logic: if the socket drops mid-demo, auto-reconnect and re-fetch `/session/{id}` to resync state rather than restarting.
- Global `demoMode` flag that can force mock responses if a presenter needs to bypass a flaky SAP service live.

### 5.4 Visual design system (carry over from pitch deck)
- Navy `#0F1A2B` / off-white `#F4F6FA` / amber `#F5A623` / teal `#0FA38F` / red `#E5484D`
- Serif headlines, sans body, uppercase tracked-out section labels
- Every screen carries a small "Live / Simulated" tag per data source so judges always know what they're looking at

### 5.5 Frontend build order
1. `AgentLog.jsx` wired to a mocked WebSocket stream first (before backend is ready) so UI work isn't blocked.
2. `WorkerApp.jsx` input + passport display.
3. `RouteMap.jsx` against real `/route` data once HANA graph is live.
4. `GhostTwinPanel.jsx` with live re-trigger — highest priority interactive element.
5. `HRConsole.jsx` last, since it's fully mocked.

---

## 6. Cross-cutting requirements

- **Honesty labeling:** every piece of data rendered in the UI must be tagged `live` or `simulated` in its API response and reflected visually (small badge), matching the "What is real today vs. mocked" slide in the pitch deck.
- **Demo persona lock:** only Kavya's flow needs to be fully wired end-to-end; do not spread effort across multiple personas.
- **Performance target:** full flow (voice in → route + match + audit out) should complete in under 60 seconds live, accounting for Generative AI Hub + HANA round-trip latency.
- **Fallback plan:** a recorded screen-capture of the complete flow, in case venue network blocks outbound HANA Cloud connectivity (port 443) or the trial services are down.

---

## 7. Timeline (5 days to finale)

| Day | Backend | Frontend |
|---|---|---|
| 0 (today) | Inventory SAP trial access, confirm HANA/GenAI Hub connectivity | Scaffold repo, build `AgentLog.jsx` against a mocked stream |
| 1 | Ghost Twin (real) + HANA graph wiring | `WorkerApp.jsx` + passport UI |
| 2 | Generative AI Hub skills extraction/scoring | `RouteMap.jsx` |
| 3 | Full LangGraph orchestrator + WebSocket events | `GhostTwinPanel.jsx` with live re-trigger |
| 4 | Mocked agents + fallback toggles + keep-alive | `HRConsole.jsx` + full integration pass |
| 5 | Buffer, rehearsal, deployed-stack testing | Buffer, rehearsal, fallback recording |

---

## 8. Open questions / to confirm from SAP onboarding email
- Exact Generative AI Hub orchestration endpoint and SDK version for this trial.
- Whether Claude is available as a model option, or only GPT/other.
- HANA Cloud instance connection details (host, port) and any daily quota limits.
- Whether the venue network allows outbound HTTPS to the HANA Cloud endpoint.
