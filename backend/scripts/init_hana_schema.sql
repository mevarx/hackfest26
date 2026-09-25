-- ReRoute: one-time SAP HANA Cloud schema setup for the learning pathway.
-- Run once against the trial instance, e.g.
--   hdbcli -i 00XLEMON "<host>" -u SYSTEM -p '<password>' -e "true" -E "false" -I init_hana_schema.sql
-- Object ownership: every object below is created in the current schema and the
-- seed inserts are keyed on the primary key, so the script can be replayed
-- without duplicating rows.

-- Skills graph vertices. One row per skill in the seeded pathway.
CREATE COLUMN TABLE SKILLS_NODES (ID INT PRIMARY KEY, NAME NVARCHAR(50));

-- Skills graph edges. HOURS is the investment needed to move SOURCE -> TARGET.
CREATE COLUMN TABLE SKILLS_EDGES (SOURCE INT, TARGET INT, HOURS INT);

-- Graph workspace wrapping the two column tables above. The workspace is what
-- learning_pathway.py reads to solve the least-hours path.
CREATE GRAPH WORKSPACE SKILLS_GRAPH
  EDGE TABLE SKILLS_EDGES SOURCE COLUMN SOURCE TARGET COLUMN TARGET
  VERTEX TABLE SKILLS_NODES KEY COLUMN ID;

-- Role embeddings for inclusive matching, written by the MiniLM encoder.
CREATE COLUMN TABLE ROLE_EMBEDDINGS (ROLE_ID NVARCHAR(20), EMBEDDING REAL_VECTOR(384));

-- Seed: same fixtures as app/mocks/hana_fixtures.py, in the same order.
UPSERT SKILLS_NODES VALUES (1, 'Manual testing');
UPSERT SKILLS_NODES VALUES (2, 'Regression testing');
UPSERT SKILLS_NODES VALUES (3, 'API testing');
UPSERT SKILLS_NODES VALUES (4, 'Test automation');
UPSERT SKILLS_NODES VALUES (5, 'SQL data validation');
UPSERT SKILLS_NODES VALUES (6, 'CI maintenance');
UPSERT SKILLS_NODES VALUES (7, 'QA analytics');
UPSERT SKILLS_NODES VALUES (8, 'Stakeholder communication');
UPSERT SKILLS_NODES VALUES (9, 'Requirements analysis');
UPSERT SKILLS_NODES VALUES (10, 'Defect triage');
UPSERT SKILLS_NODES VALUES (11, 'Release verification');
UPSERT SKILLS_NODES VALUES (12, 'Defect analytics');

UPSERT SKILLS_EDGES VALUES (1, 2, 30);
UPSERT SKILLS_EDGES VALUES (1, 3, 25);
UPSERT SKILLS_EDGES VALUES (1, 10, 15);
UPSERT SKILLS_EDGES VALUES (2, 3, 20);
UPSERT SKILLS_EDGES VALUES (2, 4, 80);
UPSERT SKILLS_EDGES VALUES (2, 8, 30);
UPSERT SKILLS_EDGES VALUES (2, 10, 10);
UPSERT SKILLS_EDGES VALUES (2, 11, 20);
UPSERT SKILLS_EDGES VALUES (3, 4, 60);
UPSERT SKILLS_EDGES VALUES (3, 5, 25);
UPSERT SKILLS_EDGES VALUES (4, 5, 35);
UPSERT SKILLS_EDGES VALUES (4, 6, 40);
UPSERT SKILLS_EDGES VALUES (5, 4, 45);
UPSERT SKILLS_EDGES VALUES (5, 7, 20);
UPSERT SKILLS_EDGES VALUES (5, 8, 20);
UPSERT SKILLS_EDGES VALUES (6, 5, 20);
UPSERT SKILLS_EDGES VALUES (6, 7, 30);
UPSERT SKILLS_EDGES VALUES (7, 8, 25);
UPSERT SKILLS_EDGES VALUES (8, 7, 18);
UPSERT SKILLS_EDGES VALUES (8, 9, 25);
UPSERT SKILLS_EDGES VALUES (9, 1, 20);
UPSERT SKILLS_EDGES VALUES (10, 11, 12);
UPSERT SKILLS_EDGES VALUES (10, 12, 18);
UPSERT SKILLS_EDGES VALUES (11, 5, 30);
UPSERT SKILLS_EDGES VALUES (11, 6, 25);
UPSERT SKILLS_EDGES VALUES (11, 8, 28);
UPSERT SKILLS_EDGES VALUES (12, 2, 20);
UPSERT SKILLS_EDGES VALUES (12, 7, 45);
