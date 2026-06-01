# Phone Flip Dashboard

A local web dashboard for a phone flipping business. It tracks inventory, purchase/sale prices, buyback pricing, marketplace margin comparisons, and AI-assisted business questions.

**Stack:** React + Vite (frontend) · FastAPI (backend) · SQLite (DB)

## Access

Default local development URLs:

- **Frontend:** `http://localhost:3001`
- **Backend API:** `http://localhost:3000`

## Environment

Copy `.env.example` to `.env` and configure local credentials:

```bash
cp .env.example .env
```

Required for AI chat and live eBay pricing:

- `MINIMAX_API_KEY`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`

Local runtime files such as `backend/inventory.db` and OAuth token caches are intentionally not committed.

## Start Locally

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000

# Frontend, in another terminal
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3001
```

Or use the startup script:

```bash
bash start.sh
```

## Key Endpoints

| Endpoint | What |
|---|---|
| `GET /api/atlas/prices` | All imported buyback prices |
| `POST /api/atlas/sync` | Re-sync from the configured source sheet |
| `GET /api/phones/with-margins` | Inventory with Atlas and retail margin comparisons |
| `GET /api/phones` | All phones in inventory |
| `GET /api/sales` | All sales |
| `GET /api/dashboard` | KPIs: total phones, revenue, profit |
| `POST /api/chat` | AI chat via MiniMax |

## Architecture

- `backend/main.py` — FastAPI server + buyback sheet parsers
- `backend/database.py` — SQLite schema + helper functions
- `backend/rag.py` — Retrieval context for inventory, buyback prices, and sales data
- `backend/ebay.py` — eBay Browse API integration
- `frontend/src/pages/` — Dashboard, Inventory, Sales, AtlasPrices, Settings, AddPhone
- `frontend/src/components/ChatPanel.jsx` — AI chat sidebar

## Buyback Source Config

The backend is designed to sync buyback pricing from a spreadsheet source using `gogcli`. Configure the sheet ID and tabs in `backend/main.py` for your own buyback provider.
