"""FastAPI backend for phone flip dashboard."""
import os
import typing
import subprocess
import re
import json
from datetime import datetime, date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import sqlite3

import rag

# ── Config ──────────────────────────────────────────────────────────────────
GOG_PATH = "/opt/homebrew/bin/gog"
ATLAS_SHEET_ID = "1pu4Adxq4MGB6Qour0k__4gBdgnggWRoSVYnJUKgxzEw"
ATLAS_TABS = ["iPhone Used", "Samsung", "iPad Used", "Google Pixel"]

DB_PATH = Path(__file__).parent / "inventory.db"
MINIMAX_MODEL = "MiniMax-M2.7"
MINIMAX_ANTHROPIC_BASE = "https://api.minimax.io/anthropic"
HERMES_CHAT_URL = "http://localhost:8080/v1/chat/completions"

# ── Database helpers ─────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS phones (
        id INTEGER PRIMARY KEY AUTOINCREMENT, imei TEXT UNIQUE NOT NULL,
        model TEXT, storage TEXT, carrier TEXT, condition TEXT,
        purchase_price REAL, purchase_date TEXT, status TEXT DEFAULT 'In Stock',
        notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, phone_id INTEGER NOT NULL,
        sale_price REAL, sale_date TEXT, platform TEXT, fees REAL DEFAULT 0,
        notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS atlas_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, device_name TEXT,
        condition TEXT, price REAL, synced_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT)""")

    # Best-effort migrations for older local DB files.
    def ensure_column(table: str, column: str, ddl: str):
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    ensure_column("phones", "carrier", "TEXT")

    conn.commit()
    conn.close()

# Initialize on import
init_db()

# ── Atlas Mobile Parsers ─────────────────────────────────────────────────────
def parse_float(s: str) -> typing.Union[float, None]:
    try:
        return float(s.strip().replace("$","").replace(",","").replace('"','').replace("#REF!",""))
    except:
        return None

def parse_iphone(rows):
    """iPhone Used tab: empty(col0) | Model(col1) | SWAP/HSO(col2) | Grade A(col3) | Grade B(col4) | Grade C(col5) | Grade D(col6) | DOA(col7)"""
    prices = []
    for line in rows:
        cols = line.split("\t")
        if len(cols) < 8:
            continue
        device = cols[1].strip().strip('"')
        if not device or device in ("Model","") or device.startswith(("Cracked","Degraded")):
            continue
        if parse_float(cols[3]) is None:
            continue
        conds = [("Grade A",3),("Grade B",4),("Grade C",5),("Grade D",6),("DOA",7)]
        for cond, idx in conds:
            p = parse_float(cols[idx])
            if p is not None:
                prices.append({"device_name": device, "condition": cond, "price": p})
    return prices

def parse_samsung(rows):
    """Samsung tab: empty(col0) | Device(col1) | Variant(col2) | NEW(col3) | A(col4) | B(col5) | C(col6) | D(col7) | DOA(col8)"""
    prices = []
    for line in rows:
        cols = line.split("\t")
        if len(cols) < 9:
            continue
        device = cols[1].strip().strip('"')
        variant = cols[2].strip().strip('"')
        if not device or device.startswith(("NEW","S","GOOGLE","Any","MUST","GALAXY")):
            continue
        if not variant or variant in ("", "NEW"):
            continue
        if parse_float(cols[4]) is None:
            continue
        full_name = f"{device} {variant}".strip()
        conds = [("NEW",3),("Grade A",4),("Grade B",5),("Grade C",6),("Grade D",7),("DOA",8)]
        for cond, idx in conds:
            raw = cols[idx].strip().replace("NOT BUYING","").strip()
            p = parse_float(raw) if raw else None
            if p is not None:
                prices.append({"device_name": full_name, "condition": cond, "price": p})
    return prices

def parse_ipad(rows):
    """iPad Used tab: empty(col0) | Model(col1) | Grade A(col2) | Grade B(col3) | Grade C(col4) | Grade D(col5) | DOA(col6)"""
    prices = []
    for line in rows:
        cols = line.split("\t")
        if len(cols) < 7:
            continue
        device = cols[1].strip().strip('"')
        if not device or device in ("Model","") or device.startswith("Grade"):
            continue
        if parse_float(cols[2]) is None:
            continue
        conds = [("Grade A",2),("Grade B",3),("Grade C",4),("Grade D",5),("DOA",6)]
        for cond, idx in conds:
            p = parse_float(cols[idx])
            if p is not None:
                prices.append({"device_name": device, "condition": cond, "price": p})
    return prices

def parse_pixel(rows):
    """Google Pixel tab: Model(col0) | Sealed(col1) | Open(col2) | A/HSO(col3) | B+(col4)"""
    prices = []
    for line in rows:
        cols = line.split("\t")
        if len(cols) < 5:
            continue
        device = cols[0].strip().strip('"')
        if not device or device.startswith(("UL:","Google","Damage")):
            continue
        if parse_float(cols[1]) is None:
            continue
        conds = [("Grade A",1),("Grade B",2),("Grade C",3),("Grade D",4)]
        for cond, idx in conds:
            p = parse_float(cols[idx])
            if p is not None:
                prices.append({"device_name": device, "condition": cond, "price": p})
    return prices

def format_atlas_display_name(name: str) -> str:
    raw = re.sub(r"\s{2,}", " ", (name or "").strip())
    if not raw:
        return raw
    lower = raw.lower()
    if lower.startswith("iphone"):
        return raw
    if lower.startswith("google pixel"):
        return raw
    if lower.startswith("pixel"):
        return f"Google {raw}"
    if lower.startswith("galaxy"):
        return f"Samsung {raw}"
    if re.match(r"^\d", raw):
        return f"iPhone {raw}"
    return raw

def atlas_parse_phone_name(name: str) -> tuple[str, str, str]:
    display = format_atlas_display_name(name).strip()
    if not display:
        return "", "", ""

    lower = display.lower()
    storage_match = re.search(r"\b(\d+(?:\.\d+)?\s*(?:gb|tb))\b", lower, flags=re.I)
    storage = storage_match.group(1).upper().replace(" ", "") if storage_match else ""

    carrier = ""
    if "unlocked" in lower:
        carrier = "Unlocked"
    elif "carrier locked" in lower or "locked" in lower:
        carrier = "Carrier Locked"

    base = display
    base = re.sub(r"\b\d+(?:\.\d+)?\s*(?:gb|tb)\b", "", base, flags=re.I)
    base = re.sub(r"\b(?:carrier locked|factory original|factory|original|sim only|sim|only|unlocked|locked|lock|unlock)\b", "", base, flags=re.I)
    base = re.sub(r"\s{2,}", " ", base).strip(" -")
    return base or display, storage, carrier

def atlas_base_name(name: str) -> str:
    base, _, _ = atlas_parse_phone_name(name)
    return base

def atlas_phone_slug(name: str) -> str:
    raw = atlas_base_name(name).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return slug or "unknown"

def atlas_manufacturer(name: str) -> str:
    raw = (name or "").strip().lower()
    if raw.startswith("iphone") or raw.startswith("ipad") or re.match(r"^\d", raw):
        return "Apple"
    if raw.startswith("google pixel") or raw.startswith("pixel"):
        return "Google"
    if raw.startswith("galaxy") or raw.startswith("s ") or raw.startswith("z "):
        return "Samsung"
    return "Other"

def atlas_group_rows(rows: list[sqlite3.Row]) -> list[dict]:
    grouped = {}
    for row in rows:
        display_name, storage, carrier = atlas_parse_phone_name(row["device_name"])
        slug = atlas_phone_slug(display_name)
        bucket = grouped.setdefault(slug, {
            "slug": slug,
            "device_name": row["device_name"],
            "display_name": display_name,
            "manufacturer": atlas_manufacturer(display_name),
            "conditions": [],
            "variants": [],
            "min_price": None,
            "max_price": None,
            "synced_at": row["synced_at"],
        })
        bucket["variants"].append({
            "device_name": row["device_name"],
            "condition": row["condition"],
            "storage": storage,
            "carrier": carrier,
            "price": row["price"],
            "synced_at": row["synced_at"],
        })
        if not any(item["condition"] == row["condition"] for item in bucket["conditions"]):
            bucket["conditions"].append({
                "condition": row["condition"],
                "price": row["price"],
                "synced_at": row["synced_at"],
            })
        bucket["min_price"] = row["price"] if bucket["min_price"] is None else min(bucket["min_price"], row["price"])
        bucket["max_price"] = row["price"] if bucket["max_price"] is None else max(bucket["max_price"], row["price"])
        if row["synced_at"] and (not bucket["synced_at"] or row["synced_at"] > bucket["synced_at"]):
            bucket["synced_at"] = row["synced_at"]
    for bucket in grouped.values():
        bucket["storage_options"] = sorted({v["storage"] for v in bucket["variants"] if v["storage"]})
        bucket["carrier_options"] = sorted({v["carrier"] for v in bucket["variants"] if v["carrier"]})
        bucket["condition_options"] = sorted({v["condition"] for v in bucket["variants"]}, key=lambda c: {
            "Grade A": 0, "Grade B": 1, "Grade C": 2, "Grade D": 3, "DOA": 4, "NEW": 5,
        }.get(c, 99))
        first_variant = bucket["variants"][0] if bucket["variants"] else {}
        bucket["default_storage"] = first_variant.get("storage", "")
        bucket["default_carrier"] = first_variant.get("carrier", "")
        bucket["default_condition"] = first_variant.get("condition", "")
    return sorted(grouped.values(), key=lambda item: item["display_name"].lower())

def atlas_match_inventory(display_name: str) -> list[dict]:
    conn = get_db()
    phones = conn.execute("SELECT * FROM phones").fetchall()
    conn.close()
    needle = atlas_base_name(display_name).lower()
    matches = []
    for phone in phones:
        model = (phone["model"] or "").lower()
        if needle in model or model in needle:
            matches.append(dict(phone))
    return matches

# ── FastAPI App ─────────────────────────────────────────────────────────────
app = FastAPI(title="Phone Flip Dashboard API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── IMEI Lookup ──────────────────────────────────────────────────────────────
def lookup_imei(imei: str) -> typing.Optional[dict]:
    """Free IMEI lookup via IMEI API (500 credits free)."""
    try:
        import requests
        r = requests.get(f"https://api.imeiapi.org/api/v1/imei_lookup?apikey=&imei={imei}", timeout=10)
        if r.status_code == 200:
            data = r.json().get("data", [{}])[0]
            model = data.get("device_name", "") or ""
            storage = data.get("storage", "") or ""
            carrier = data.get("sim_lock", "") or ""
            found = any([model, storage, carrier])
            return {
                "found": found,
                "model": model,
                "storage": storage,
                "carrier": carrier,
                "source": "imeiapi.org",
            }
    except Exception:
        pass
    # Fallback: extract from IMEI (TAC digits 6-8 = model code)
    tac = imei[0:8] if len(imei) >= 8 else imei
    return {
        "found": False,
        "model": "",
        "storage": "",
        "carrier": "",
        "error": f"No lookup data found (TAC: {tac})",
        "source": "fallback",
    }

@app.get("/api/imei/{imei}")
def imei_lookup(imei: str):
    if not re.match(r'^\d{15}$', imei):
        raise HTTPException(status_code=400, detail="Invalid IMEI format (need 15 digits)")
    info = lookup_imei(imei)
    return info

# ── Atlas Sync & Prices ──────────────────────────────────────────────────────
def sync_all_atlas():
    all_prices = []
    for tab in ATLAS_TABS:
        result = subprocess.run(
            [GOG_PATH, "sheets", "get", ATLAS_SHEET_ID, f"{tab}!A1:Z2000", "-p"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            continue
        lines = result.stdout.strip().split("\n")
        if tab == "iPhone Used":
            prices = parse_iphone(lines)
        elif tab == "Samsung":
            prices = parse_samsung(lines)
        elif tab == "iPad Used":
            prices = parse_ipad(lines)
        elif tab == "Google Pixel":
            prices = parse_pixel(lines)
        else:
            prices = []
        all_prices.extend(prices)
    return all_prices

@app.post("/api/atlas/sync")
def sync_atlas():
    prices = sync_all_atlas()
    if not prices:
        raise HTTPException(status_code=500, detail="No price data found — check gogcli auth")
    conn = get_db()
    conn.execute("DELETE FROM atlas_snapshots")
    now = datetime.now().isoformat()
    for p in prices:
        conn.execute(
            "INSERT INTO atlas_snapshots (device_name, condition, price, synced_at) VALUES (?,?,?,?)",
            (p["device_name"], p["condition"], p["price"], now)
        )
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_atlas_sync', ?)", (now,))
    conn.commit()
    conn.close()
    return {"ok": True, "count": len(prices), "tabs": ATLAS_TABS, "tabs_synced": ATLAS_TABS}

@app.get("/api/atlas/prices")
def get_atlas_prices():
    conn = get_db()
    rows = conn.execute(
        "SELECT device_name, condition, price, synced_at FROM atlas_snapshots ORDER BY device_name, condition"
    ).fetchall()
    conn.close()
    return [{**dict(r), "display_name": format_atlas_display_name(r["device_name"])} for r in rows]

@app.get("/api/atlas/phones")
def get_atlas_phones():
    conn = get_db()
    rows = conn.execute(
        "SELECT device_name, condition, price, synced_at FROM atlas_snapshots ORDER BY device_name, condition"
    ).fetchall()
    conn.close()
    return atlas_group_rows(rows)

@app.get("/api/atlas/phones/{slug}")
def get_atlas_phone(slug: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT device_name, condition, price, synced_at FROM atlas_snapshots ORDER BY device_name, condition"
    ).fetchall()
    conn.close()
    phone = next((item for item in atlas_group_rows(rows) if item["slug"] == slug), None)
    if not phone:
        raise HTTPException(status_code=404, detail="Atlas phone not found")
    phone["inventory"] = atlas_match_inventory(phone["display_name"])
    return phone

@app.get("/api/atlas/prices/with-margin")
def get_prices_with_margin():
    """Inventory with Atlas margin — fuzzy matched."""
    conn = get_db()
    phones = conn.execute("SELECT * FROM phones WHERE status='In Stock'").fetchall()
    atlas = {f"{r['device_name']}|{r['condition']}": r['price'] for r in conn.execute("SELECT device_name, condition, price FROM atlas_snapshots").fetchall()}
    conn.close()
    result = []
    for p in phones:
        pm = (p["model"] or "").lower()
        pc = (p["condition"] or "").lower()
        key = next((k for k in atlas if pm in k.lower() or k.lower() in pm), None)
        if not key:
            for k in atlas:
                words = pm.split()[:3]
                if all(w in k.lower() for w in words):
                    key = k
                    break
        atlas_price = atlas[key] if key else None
        margin = round(atlas_price - p["purchase_price"], 2) if atlas_price and p["purchase_price"] else None
        result.append({
            **dict(p),
            "atlas_price": atlas_price,
            "margin": margin,
        "display_name": atlas_base_name(key.split("|")[0]) if key else atlas_base_name(p["model"] or ""),
    })
    return result

@app.get("/api/atlas/debug-sync")
def debug_sync():
    """Return raw sync_all_atlas() output without inserting to DB."""
    prices = sync_all_atlas()
    by_prefix = {}
    for p in prices:
        prefix = p["device_name"].split()[0] if p["device_name"] else "?"
        if prefix not in by_prefix: by_prefix[prefix] = 0
        by_prefix[prefix] += 1
    return {
        "total": len(prices),
        "by_prefix": dict(sorted(by_prefix.items(), key=lambda x: -x[1])[:10]),
        "sample": prices[:3],
    }

# ── Phone CRUD ───────────────────────────────────────────────────────────────
@app.get("/api/phones")
def list_phones(status: str = None):
    conn = get_db()
    if status:
        rows = conn.execute("SELECT * FROM phones WHERE status=? ORDER BY created_at DESC", (status,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM phones ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/phones")
def add_phone(phone: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        purchase_date = phone.get("purchase_date") or date.today().isoformat()
        cur.execute("""INSERT INTO phones (imei, model, storage, carrier, condition, purchase_price, purchase_date, notes)
            VALUES (?,?,?,?,?,?,?,?)""",
            (phone.get("imei"), phone.get("model"), phone.get("storage"),
             phone.get("carrier"), phone.get("condition"), phone.get("purchase_price"),
             purchase_date, phone.get("notes")))
        conn.commit()
        pid = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="IMEI already exists")
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))
    conn.close()
    return {"id": pid}

@app.put("/api/phones/{pid}")
@app.patch("/api/phones/{pid}")
def update_phone(pid: int, fields: dict):
    allowed = ["model","storage","carrier","condition","purchase_price","status","notes"]
    sets = [f"{k}=?" for k in fields if k in allowed]
    if not sets:
        raise HTTPException(status_code=400, detail="No valid fields")
    conn = get_db()
    conn.execute(f"UPDATE phones SET {','.join(sets)} WHERE id=?", [fields[k] for k in fields if k in allowed] + [pid])
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/phones/{pid}")
def delete_phone(pid: int):
    conn = get_db()
    conn.execute("DELETE FROM sales WHERE phone_id=?", (pid,))
    conn.execute("DELETE FROM phones WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Sales CRUD ────────────────────────────────────────────────────────────────
@app.get("/api/sales")
def list_sales():
    conn = get_db()
    rows = conn.execute("""SELECT s.*, p.model, p.imei, p.condition, p.purchase_price
        FROM sales s JOIN phones p ON s.phone_id=p.id ORDER BY s.sale_date DESC""").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/sales")
def record_sale(sale: dict):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO sales (phone_id, sale_price, sale_date, platform, fees, notes) VALUES (?,?,?,?,?,?)",
        (sale["phone_id"], sale["sale_price"], sale.get("sale_date", date.today().isoformat()),
         sale.get("platform","Atlas"), sale.get("fees",0), sale.get("notes","")))
    conn.execute("UPDATE phones SET status='Sold' WHERE id=?", (sale["phone_id"],))
    conn.commit()
    conn.close()
    return {"id": cur.lastrowid}

@app.delete("/api/sales/{sid}")
def delete_sale(sid: int):
    conn = get_db()
    sale = conn.execute("SELECT phone_id FROM sales WHERE id=?", (sid,)).fetchone()
    if not sale:
        conn.close()
        raise HTTPException(status_code=404, detail="Sale not found")
    conn.execute("DELETE FROM sales WHERE id=?", (sid,))
    conn.execute("UPDATE phones SET status='In Stock' WHERE id=?", (sale["phone_id"],))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Dashboard KPIs ────────────────────────────────────────────────────────────
@app.get("/api/dashboard")
def dashboard():
    conn = get_db()
    stats = {
        "total_phones": conn.execute("SELECT COUNT(*) FROM phones WHERE status='In Stock'").fetchone()[0],
        "total_revenue": round(conn.execute("SELECT COALESCE(SUM(sale_price),0) FROM sales").fetchone()[0], 2),
        "total_fees": round(conn.execute("SELECT COALESCE(SUM(fees),0) FROM sales").fetchone()[0], 2),
        "total_profit": round(conn.execute("""SELECT COALESCE(SUM(s.sale_price - s.fees - COALESCE(p.purchase_price,0)),0)
            FROM sales s JOIN phones p ON s.phone_id=p.id""").fetchone()[0], 2),
        "in_stock_value": round(conn.execute("SELECT COALESCE(SUM(purchase_price),0) FROM phones WHERE status='In Stock'").fetchone()[0], 2),
        "total_purchase_cost": round(conn.execute("SELECT COALESCE(SUM(purchase_price),0) FROM phones").fetchone()[0], 2),
        "atlas_count": conn.execute("SELECT COUNT(*) FROM atlas_snapshots").fetchone()[0],
        "last_atlas_sync": conn.execute("SELECT value FROM settings WHERE key='last_atlas_sync'").fetchone(),
    }
    conn.close()
    if stats["last_atlas_sync"]:
        stats["last_atlas_sync"] = stats["last_atlas_sync"][0]
    return stats

# ── RAG Chat Helpers ─────────────────────────────────────────────────────────

MINIMAX_ANTHROPIC_URL = "https://api.minimax.io/anthropic/v1/messages"

def _get_minimax_api_key() -> str:
    """Load MiniMax API key from environment or a local .env file."""
    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    if api_key:
        return api_key
    for env_file in (Path.cwd() / ".env", Path(__file__).resolve().parent.parent / ".env"):
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("MINIMAX_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if api_key:
                        return api_key
    raise RuntimeError("MINIMAX_API_KEY is not configured")


def _build_system_message(context_text: str) -> str:
    """Build the system prompt with RAG context."""
    return f"""You are helping with a phone flipping business. Use the context below to answer questions accurately and concisely.

{context_text}

Important guidelines:
- When asked about specific models, reference the prices from the context above when available
- When discussing margins, use actual sale prices and purchase prices from context
- Be concise and actionable in your responses
- If you don't have enough information, say so rather than guessing"""


def _call_minimax(messages: list[dict], api_key: str, stream: bool = False) -> dict:
    """Call MiniMax Messages API and return parsed response."""
    import requests
    payload = {
        "model": MINIMAX_MODEL,
        "max_tokens": 1024,
        "messages": messages,
    }
    if stream:
        payload["stream"] = True
    r = requests.post(
        MINIMAX_ANTHROPIC_URL,
        json=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        timeout=60,
        stream=stream,
    )
    r.raise_for_status()
    return r


# ── eBay Integration ──────────────────────────────────────────────────────────

@app.get("/api/phones/with-margins")
def phones_with_margins():
    """Return inventory with BOTH Atlas and eBay margins calculated."""
    import ebay as ebay_module
    conn = get_db()
    phones = conn.execute("SELECT * FROM phones WHERE status='In Stock' ORDER BY created_at DESC").fetchall()
    atlas_rows = conn.execute("SELECT device_name, condition, price FROM atlas_snapshots").fetchall()
    # Store ALL prices per slug|condition, then pick the max per variant type
    atlas_all = {}
    for r in atlas_rows:
        slug = atlas_phone_slug(r["device_name"])
        key = f"{slug}|{r['condition']}"
        if key not in atlas_all:
            atlas_all[key] = []
        atlas_all[key].append((r["device_name"], r["price"]))
    result = []
    for p in phones:
        pm = (p["model"] or "").strip()
        pc_raw = (p["condition"] or "").strip()
        grade_map = {"A-grade": "Grade A", "B-grade": "Grade B", "C-grade": "Grade C", "D-grade": "Grade D"}
        pc = grade_map.get(pc_raw, pc_raw)
        pm_slug = atlas_phone_slug(pm)
        pm_lower = pm.lower()
        has_unlocked = "unlocked" in pm_lower
        has_locked = "locked" in pm_lower or "carrier" in pm_lower
        has_storage = any(s in pm_lower for s in ["128gb", "256gb", "512gb", "1tb"])

        # Collect all matching prices
        all_matched = [(dn, price) for key_raw, prices in atlas_all.items() for dn, price in prices if pm_slug in key_raw and f"|{pc}" in key_raw]
        if all_matched:
            if has_unlocked:
                unlocked = [(dn, price) for dn, price in all_matched if "unlocked" in dn.lower()]
                atlas_price = max(unlocked, key=lambda x: x[1])[1] if unlocked else max(all_matched, key=lambda x: x[1])[1]
            elif has_locked or has_storage:
                non_unlocked = [(dn, price) for dn, price in all_matched if "unlocked" not in dn.lower()]
                atlas_price = max(non_unlocked, key=lambda x: x[1])[1] if non_unlocked else max(all_matched, key=lambda x: x[1])[1]
            else:
                # No variant specified — prefer highest unlocked price (best case for seller)
                unlocked = [(dn, price) for dn, price in all_matched if "unlocked" in dn.lower()]
                atlas_price = max(unlocked, key=lambda x: x[1])[1] if unlocked else max(all_matched, key=lambda x: x[1])[1]
        else:
            atlas_price = None
        atlas_margin = round(atlas_price - p["purchase_price"], 2) if atlas_price and p["purchase_price"] else None
        eb_result = ebay_module.get_ebay_price_for_model(pm, pc) if pm else {"error": "No model"}
        if isinstance(eb_result, dict) and "error" in eb_result:
            ebay_avg = ebay_low = None
        else:
            ebay_avg = eb_result.get("average")
            ebay_low = eb_result.get("lowest")
        net_proceeds = None
        ebay_margin = None
        if ebay_avg and p["purchase_price"]:
            fees = ebay_avg * 0.1325
            net_proceeds = round(ebay_avg - fees, 2)
            ebay_margin = round(net_proceeds - p["purchase_price"], 2)
        result.append({
            **dict(p),
            "atlas_price": atlas_price,
            "atlas_margin": atlas_margin,
            "ebay_avg": ebay_avg,
            "ebay_low": ebay_low,
            "ebay_margin": ebay_margin,
            "ebay_fees_pct": 13.25,
            "ebay_net_proceeds": net_proceeds,
            "best_platform": "Retail" if (ebay_margin or -9999) > (atlas_margin or -9999) else "Atlas",
            "status": p["status"] or "In Stock",
        })
    conn.close()
    return result

@app.get("/api/atlas/models")
def get_atlas_models():
    """Return all unique phone model names from atlas_snapshots."""
    conn = get_db()
    rows = conn.execute("SELECT device_name FROM atlas_snapshots").fetchall()
    conn.close()
    names = sorted(set(
        format_atlas_display_name(r["device_name"])
        for r in rows if r["device_name"]
    ))
    return {"models": names}

@app.get("/api/ebay/search")
def ebay_search(q: str, limit: int = 5):
    """Search eBay for active listings."""
    import ebay as ebay_module
    results = ebay_module.search_ebay(q, limit=limit)
    if isinstance(results, dict) and "error" in results:
        raise HTTPException(status_code=502, detail=results["error"])
    return {"query": q, "results": results}

@app.get("/api/ebay/price")
def ebay_price(model: str, condition: str = "Grade A"):
    """Get eBay price stats for a phone model + condition."""
    import ebay as ebay_module
    result = ebay_module.get_ebay_price_for_model(model, condition)
    if isinstance(result, dict) and "error" in result:
        return result
    return {"model": model, "condition": condition, **result}

@app.get("/api/margins/compare")
def compare_margins(model: str, buy_price: float = None):
    """Compare Atlas vs eBay margin for a specific model."""
    import ebay as ebay_module
    conn = get_db()
    slug = atlas_phone_slug(model)
    atlas_prices = conn.execute("SELECT device_name, condition, price FROM atlas_snapshots").fetchall()
    atlas_map = {}
    for r in atlas_prices:
        key = f"{atlas_phone_slug(r['device_name'])}|{r['condition']}"
        atlas_map[key] = r["price"]
    atlas_key = next((k for k in atlas_map if slug in k), None)
    if not atlas_key:
        for k in atlas_map:
            if all(w in k.lower() for w in slug.lower().split()[:3]):
                atlas_key = k
                break
    atlas_price = atlas_map.get(atlas_key)
    eb_result = ebay_module.get_ebay_price_for_model(model, "Grade A")
    ebay_avg = eb_result.get("average") if isinstance(eb_result, dict) else None
    ebay_low = eb_result.get("lowest") if isinstance(eb_result, dict) else None
    conn.close()
    resp = {"model": model, "atlas_price": atlas_price, "ebay_avg": ebay_avg, "ebay_low": ebay_low, "ebay_fees_pct": 13.25}
    if buy_price:
        atlas_net = round((atlas_price or 0) - buy_price, 2) if atlas_price else None
        ebay_fees = (ebay_avg or 0) * 0.1325
        ebay_net = round((ebay_avg or 0) - ebay_fees - buy_price, 2) if ebay_avg else None
        resp.update({"buy_price": buy_price, "atlas_margin": atlas_net, "ebay_margin": ebay_net, "best_platform": "eBay" if (ebay_margin or -9999) > (atlas_net or -9999) else "Atlas"})
    return resp


# ── AI Chat (RAG) ─────────────────────────────────────────────────────────────

@app.post("/api/chat")
def chat(message: dict):
    """RAG-powered chat using MiniMax. Accepts {message: "..."} or {messages: [{"role":..., "content":...}]}"""
    try:
        # Parse input
        messages = message.get("messages")
        if messages is None:
            prompt = message.get("message") or message.get("content") or ""
            messages = [{"role": "user", "content": prompt}]

        # Extract the user's latest message for RAG retrieval
        user_message = messages[-1].get("content", "") if messages else ""
        if not user_message:
            return {"reply": "I didn't receive a message.", "error": None}

        # Retrieve relevant context
        kb = rag.get_kb()
        context_text = kb.as_context_text(user_message, top_k=5)

        # Build conversation with system prompt
        system_prompt = _build_system_message(context_text)
        full_messages = [{"role": "system", "content": system_prompt}] + messages

        # Call MiniMax
        api_key = _get_minimax_api_key()
        response = _call_minimax(full_messages, api_key)
        payload = response.json()

        reply = ""
        content = payload.get("content")
        if isinstance(content, list):
            reply = "".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            )
        elif isinstance(content, str):
            reply = content

        return {"reply": reply, "raw": payload, "provider": "minimax", "rag_context": bool(context_text)}

    except RuntimeError as e:
        return {"reply": f"Configuration error: {e}", "error": str(e)}
    except Exception as e:
        return {"reply": f"Error: {e}", "error": str(e)}


@app.post("/api/chat/stream")
def chat_stream(message: dict):
    """Streaming RAG chat using Server-Sent Events."""
    import requests

    async def event_generator():
        try:
            messages = message.get("messages")
            if messages is None:
                prompt = message.get("message") or message.get("content") or ""
                messages = [{"role": "user", "content": prompt}]

            user_message = messages[-1].get("content", "") if messages else ""
            if not user_message:
                err_payload = json.dumps({"reply": "I did not receive a message."})
                yield f"data: {err_payload}\n"

            kb = rag.get_kb()
            context_text = kb.as_context_text(user_message, top_k=5)
            system_prompt = _build_system_message(context_text)
            full_messages = [{"role": "system", "content": system_prompt}] + messages

            api_key = _get_minimax_api_key()
            response = _call_minimax(full_messages, api_key, stream=True)

            for line in response.iter_lines():
                if line:
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: "):
                        yield decoded + "\n"
            yield "data: [DONE]\n"
        except Exception as e:
            err_payload = json.dumps({"error": str(e)})
            yield f"data: {err_payload}\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/rag/update")
def rag_update():
    """Refresh the RAG knowledge base from current DB state."""
    try:
        rag.refresh_kb()
        kb = rag.get_kb()
        return {
            "ok": True,
            "inventory_count": len(kb.inventory_chunks),
            "atlas_count": len(kb.atlas_chunks),
            "sales_count": len(kb.sales_chunks),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/info")
def info():
    return {
        "version": "1.0.0",
        "atlas_tabs": ATLAS_TABS,
        "atlas_sheet_id": ATLAS_SHEET_ID,
        "db_path": str(DB_PATH),
    }
