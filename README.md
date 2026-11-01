# Periodic Table of Proteins

An interactive periodic table for 176 well-studied human proteins.

- **Columns (groups) = function family**: kinases, proteases, receptors, transcription factors…
- **Rows (periods) = where the protein works**, ordered from the nucleus out of the cell.
- **Protein number** = order of discovery (hemoglobin, 1840, is near the start; cGAS, 2013, is last).
- **Misfolding block** (like the lanthanides): disease conformers such as PrPˢᶜ, amyloid-β and ATTR.
  The *Native ⇄ Misfolded* switch flips tiles to their misfolded form (an "allotrope": same sequence, different fold).

Features:
- **Interactions**: physical contacts (STRING, score ≥ 0.7), coloured by what they do where curated literature agrees
  (OmniPath): activates →, inhibits ⊣, both, regulates (sign unclear) or plain contact. Shown as lines on the table and
  in a rotatable **3D interaction network** (arrange by interactions, by cell layer or by family cluster).
- **What holds it together** (per protein): chemical formula and atom counts computed from the real sequence, metals it
  needs and which residues grip them, the ladder of bonds from covalent (peptide, disulfide) to weak (hydrogen bonds,
  ionic, hydrophobic effect), amino-acid make-up, a 3D view coloured by each of these, and an atom-by-atom drawing of
  its first three amino acids joining by peptide bonds.
- **Assembly** (per protein): expert-curated complexes it builds (EBI Complex Portal) with copy numbers, e.g.
  hemoglobin = 2 α + 2 β + 4 heme, shown as a diagram and in 3D; plus proteins made as one chain and then cut
  (e.g. insulin's B and A chains).
- Pathway highlighting with a clickable key, disease variants ("isotopes"), discovery timeline, organism switch (human,
  mouse, yeast, *E. coli*), drug-target badges, side-by-side comparison, structure viewer (AlphaFold + PDB) and
  shareable links such as `/#p53`.

## Stack

| Part | Tech |
|---|---|
| Frontend (`frontend/`) | React 19, Vite 8, Tailwind CSS 4, TanStack Query, 3Dmol.js, 3d-force-graph / three.js (JavaScript) |
| Backend (`backend/`) | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic 2, uv |
| Database | PostgreSQL 18 (Postgres.app) |

The frontend only talks to the backend through the REST API under `/api` (proxied by Vite in development).

## Running it

1. Start PostgreSQL (open Postgres.app, or run):
   ```bash
   /Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D "$HOME/Library/Application Support/Postgres/var-18" start
   ```
2. Backend, first time only (creates the tables and loads the data):
   ```bash
   cd backend && ~/.local/bin/uv run alembic upgrade head && ~/.local/bin/uv run python -m seed.load
   ```
3. Start both servers (each in its own terminal):
   ```bash
   ./scripts/dev-backend.sh
   ```
   ```bash
   ./scripts/dev-frontend.sh
   ```
4. Open http://127.0.0.1:5173.

The database URL defaults to `postgresql+asyncpg://localhost:5432/protein_table`; override it with
`DATABASE_URL` in `backend/.env`.


## Publishing (static site)

The data is read-only, so the public site is plain files: no server or database online. FastAPI + Postgres stay
on your machine to build the data. `npm run dev` still uses the live API; `npm run build` uses the exported files.

1. **Export the data** (Postgres running, database seeded). Re-run this whenever the data changes:
   ```bash
   cd backend && ~/.local/bin/uv run python -m seed.export_static
   ```
   This writes `frontend/public/data/` (529 JSON files, ~1.8 MB). Commit these files.
2. **Check the production build locally** (optional):
   ```bash
   cd frontend && npm run build && npm run preview
   ```
3. **Put the project on GitHub**, then connect the repo to a static host:
   - **Cloudflare Pages** or **Netlify**: root/base directory `frontend`, build command `npm run build`,
     output/publish directory `dist`, environment variable `NODE_VERSION=24`.
     Both read the generated `dist/_headers` file, so the security headers (including the
     Content-Security-Policy) apply automatically.
   - **GitHub Pages** also works, but can't send those security headers. For a project page under
     `/<repo-name>/`, build with `npm run build -- --base=/<repo-name>/`.
4. Every push to GitHub then redeploys the site. A custom domain can be added in the host's settings.

Data credits shown on the site (UniProt, AlphaFold DB, RCSB PDB, STRING, OmniPath, EBI Complex Portal, Alliance of
Genome Resources) are required by their licences (mostly CC BY 4.0). Some OmniPath sources are non-commercial only.

## Security

- **API docs are off** (`/docs`, `/redoc`, `/openapi.json` return 404). To use them while developing, put
  `ENABLE_DOCS=true` in `backend/.env` and restart the backend.
- (Local / self-hosted API only; the published static site has no API.)
- **Opening `/api/...` in the browser's address bar returns 404.** The app's own requests still work. This keeps the
  raw API out of casual view, but it is not access control: any data a web page shows passes through the browser and
  can be seen in DevTools. That's fine here because the API is read-only and serves public data only.
- **Every input is validated** (protein keys, filter codes, organism, year, search length), so bad input gets a
  422 or 404, never a server error. Error messages don't echo input back. Search treats `%` and `_` literally.
- **Only `localhost` / `127.0.0.1` Host headers are accepted** (blocks DNS-rebinding attacks). Add hosts with
  `ALLOWED_HOSTS` in `backend/.env` if you deploy.
- **No cross-origin access**: the browser reaches the API through the frontend's own origin. Set `CORS_ORIGINS`
  only if the frontend is hosted elsewhere.
- **Rate limit**: 300 requests per minute per client (HTTP 429 after that); change with `RATE_LIMIT_PER_MINUTE`.
- **Security headers** on both servers (`nosniff`, no framing, referrer policy). The production build served by
  `npm run preview` also sends a Content-Security-Policy.
- **Text from external databases is never treated as HTML** (the 3D tooltip escapes it).
- Dependencies scanned with `npm audit` and `pip-audit`: no known vulnerabilities (2026-10-31).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/table` | Everything the grid needs in one call (families, locations, pathways, proteins, interactions) |
| `GET /api/proteins?q=&family=&location=&pathway=&organism=&drug_target=&misfolds=&discovered_by=` | Filtered list |
| `GET /api/proteins/{id \| symbol \| gene \| UniProt}` | Full detail incl. sequence, variants, partners and their effects |
| `GET /api/proteins/{key}/anatomy` | Formula, elements, metals, bond counts, amino-acid composition, secondary structure |
| `GET /api/proteins/{key}/assembly` | Curated complexes (with copy numbers) and processed chains |
| `GET /api/compare?a=p53&b=MDM2` | Side-by-side comparison, shared pathways and partners |

## Data

- `backend/seed/curated.py`: the hand-curated part (placement, blurbs, milestones, variants, drugs,
  misfolded forms, *E. coli* homologs). Edit this to add or move proteins.
- `backend/seed/enrich.py`: fetches mass, length, sequence, function, PDB IDs (UniProt), AlphaFold models,
  mouse/yeast orthologs (Alliance of Genome Resources, ≥5 agreeing methods), interactions
  (STRING, physical, score ≥ 0.7), their effects (OmniPath consensus), curated complexes (EBI Complex Portal) and
  structural features (disulfides, helices/strands, metal sites, chains) into `enriched.json`. Re-run with `uv run python -m seed.enrich`, then `seed.load`.

Discovery years mark the first identification or a defining milestone (each tile says which). They are
for orientation, not historical scholarship.
