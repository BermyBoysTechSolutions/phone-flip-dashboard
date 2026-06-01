# Phone Flip Dashboard — SPEC.md

## Overview
Single-page React + FastAPI web app running locally on Mac Mini. Complete phone flipping business management — inventory, buyback prices, IMEI lookup, sales tracking, AI chat.

**Stack:** React (frontend) + FastAPI (backend) + SQLite (inventory DB) + gogcli (Atlas sheet sync)

---

## Features

### 1. Inventory Manager
- Add/edit/delete phones
- Fields: IMEI, Model, Storage, Condition (Grade A/B/C/D/DOA), Purchase Price, Purchase Date, Status (In Stock / Sold / Returned)
- One-click "Add Sale" when selling
- Bulk import from CSV

### 2. Atlas Mobile Sheet Sync
- Reads Atlas buyback prices via `gog sheets get <id> <range>`
- Auto-sync on schedule (configurable, default: daily at 9am ET)
- Stores latest price table in local DB
- Shows which inventory phones have positive margin based on current Atlas prices
- Highlight rows where Atlas price > your purchase price

### 3. IMEI Lookup
- Input IMEI → lookup via public API (cheapest/available service)
- Display: model, storage, carrier, blacklist status, activation lock
- Auto-populate inventory fields from IMEI data

### 4. Sales Tracker
- Link to inventory item
- Fields: Sale Price, Sale Date, Platform (Atlas / eBay / Swappa / Other), Fees, Net Margin
- Dashboard: total revenue, total margin, average margin %, best sellers

### 5. AI Chat Panel
- Lives in sidebar/panel on the right
- Connected to inventory DB + Atlas prices
- Can answer: "what phones do I have with positive margin if Atlas raises iPhone 15 by $20?", "what's my average margin on iPhone 13?", "show me all phones I've held longer than 30 days"
- Uses MiniMax-M2.7 via Hermes backend

---

## Data Architecture

```
inventory.db (SQLite)
├── phones           — id, imei, model, storage, condition, purchase_price, purchase_date, status, notes
├── sales            — id, phone_id, sale_price, sale_date, platform, fees, notes
├── atlas_snapshots  — id, timestamp, model, condition, price
└── settings         — key, value (last sync, etc.)
```

---

## Atlas Sheet Sync — Technical Approach

1. `gog sheets get "1pu4Adxq4MGB6Qour0k__4gBdgnggWRoSVYnJUKgxzEw" "A1:Z1028" -p`
2. Parse rows — extract device name (column A), grade prices (columns B-E for different grades)
3. Upsert into `atlas_snapshots` table with timestamp
4. Run on cron: daily at 9am ET

**Atlas sheet structure (to parse):**
- Row 1-60: Header info, grading rules (skip)
- Row 61+: Price rows — device name in col A, Grade A/B/C/D prices in subsequent cols
- Need to reverse-engineer exact row positions from actual sheet data

---

## IMEI Lookup — Technical Approach

Use free IMEI API:
- `https://imeidata.net/api/` (free tier available)
- Or scrape from `https://www.imei.info/` as fallback
- Store results in phone record

---

## Chat Architecture

```
User → React Chat UI → FastAPI /chat 
  → MiniMax-M2.7 (local Hermes at localhost:8080 or via gRPC)
  → System prompt includes: inventory schema, atlas prices, recent sales summary
  → LLM answers with context awareness
```

---

## Pages

1. **Dashboard** (`/`) — KPI cards: total inventory value, average margin, phones in stock, last Atlas sync time
2. **Inventory** (`/inventory`) — table view with filters, search, bulk actions
3. **Add Phone** (`/inventory/add`) — form with IMEI auto-lookup
4. **Sales** (`/sales`) — sales table with margin calculations
5. **Atlas Prices** (`/atlas`) — current Atlas price sheet with margin overlay on inventory
6. **Chat** (`/chat`) — dedicated chat page + persistent sidebar on all pages

---

## Non-Goals (Out of Scope)
- Multi-user / auth — single user, local only
- Payment processing — track manually
- Shipping label generation
- eBay listing integration (yet)

---

## Phased Build

**Phase 1 — Foundation (NOW)**
- [ ] FastAPI backend with SQLite
- [ ] Inventory CRUD
- [ ] Atlas sheet sync (manual trigger initially)
- [ ] Basic React UI with inventory table

**Phase 2 — Business Logic**
- [ ] IMEI lookup integration
- [ ] Sales tracker
- [ ] Margin calculations
- [ ] Dashboard KPIs

**Phase 3 — AI Integration**
- [ ] Chat panel with inventory context
- [ ] Scheduled Atlas sync
- [ ] Alert system (positive margin opportunities)

---

## Setup Notes
- Mac Mini as server — `python -m uvicorn main:app --reload --host 0.0.0.0 --port 3000`
- gogcli path: `/opt/homebrew/bin/gog`
- Atlas sheet ID: `1pu4Adxq4MGB6Qour0k__4gBdgnggWRoSVYnJUKgxzEw`
- Atlas updated: 2026-05-18 15:00 UTC