"""Database models and schema for phone flip dashboard."""
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "inventory.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS phones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imei TEXT UNIQUE NOT NULL,
            model TEXT NOT NULL,
            storage TEXT,
            condition TEXT DEFAULT 'Grade A',
            purchase_price REAL,
            purchase_date TEXT,
            status TEXT DEFAULT 'In Stock',
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            carrier TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_id INTEGER NOT NULL,
            sale_price REAL NOT NULL,
            sale_date TEXT,
            platform TEXT DEFAULT 'Atlas',
            fees REAL DEFAULT 0,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (phone_id) REFERENCES phones(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS atlas_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            device_name TEXT,
            condition TEXT,
            price REAL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    conn.commit()
    conn.close()

# ─── Phone CRUD ────────────────────────────────────────────────────────────────

def list_phones(status=None):
    conn = get_db()
    if status:
        rows = conn.execute("SELECT * FROM phones WHERE status=? ORDER BY created_at DESC", (status,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM phones ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_phone(id):
    conn = get_db()
    row = conn.execute("SELECT * FROM phones WHERE id=?", (id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def add_phone(imei, model, storage=None, carrier=None, condition="Grade A", purchase_price=None,
              purchase_date=None, notes=None):
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO phones (imei, model, storage, carrier, condition, purchase_price, purchase_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (imei, model, storage, carrier, condition, purchase_price, purchase_date, notes))
    conn.commit()
    phone_id = c.lastrowid
    conn.close()
    return phone_id

def update_phone(id, **fields):
    allowed = ["imei","model","storage","carrier","condition","purchase_price","purchase_date","status","notes"]
    sets = [f"{k}=?" for k in fields if k in allowed]
    vals = [fields[k] for k in fields if k in allowed] + [id]
    if not sets:
        return
    conn = get_db()
    conn.execute(f"UPDATE phones SET {','.join(sets)} WHERE id=?", vals)
    conn.commit()
    conn.close()

def delete_phone(id):
    conn = get_db()
    conn.execute("DELETE FROM sales WHERE phone_id=?", (id,))
    conn.execute("DELETE FROM phones WHERE id=?", (id,))
    conn.commit()
    conn.close()

# ─── Sales CRUD ───────────────────────────────────────────────────────────────

def list_sales():
    conn = get_db()
    rows = conn.execute("""
        SELECT s.*, p.model, p.imei, p.condition, p.purchase_price
        FROM sales s JOIN phones p ON s.phone_id=p.id
        ORDER BY s.sale_date DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_sale(phone_id, sale_price, sale_date=None, platform="Atlas", fees=0, notes=None):
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO sales (phone_id, sale_price, sale_date, platform, fees, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (phone_id, sale_price, sale_date, platform, fees, notes))
    conn.execute("UPDATE phones SET status='Sold' WHERE id=?", (phone_id,))
    conn.commit()
    conn.close()

def delete_sale(id):
    conn = get_db()
    row = conn.execute("SELECT phone_id FROM sales WHERE id=?", (id,)).fetchone()
    if row:
        conn.execute("UPDATE phones SET status='In Stock' WHERE id=?", (row[0],))
    conn.execute("DELETE FROM sales WHERE id=?", (id,))
    conn.commit()
    conn.close()

# ─── Atlas Snapshots ─────────────────────────────────────────────────────────

def upsert_atlas_prices(prices: list[dict]):
    """prices: [{device_name, condition, price}, ...]"""
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM atlas_snapshots")
    ts = datetime.utcnow().isoformat()
    for p in prices:
        c.execute("""
            INSERT INTO atlas_snapshots (timestamp, device_name, condition, price)
            VALUES (?, ?, ?, ?)
        """, (ts, p.get("device_name"), p.get("condition"), p.get("price")))
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_atlas_sync', ?)", (ts,))
    conn.commit()
    conn.close()

def get_atlas_prices():
    conn = get_db()
    rows = conn.execute("SELECT * FROM atlas_snapshots ORDER BY device_name").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_last_atlas_sync():
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key='last_atlas_sync'").fetchone()
    conn.close()
    return row[0] if row else None

# ─── Dashboard KPIs ──────────────────────────────────────────────────────────

def get_dashboard_stats():
    conn = get_db()

    total_phones = conn.execute("SELECT COUNT(*) FROM phones WHERE status='In Stock'").fetchone()[0]
    total_revenue = conn.execute("SELECT COALESCE(SUM(sale_price),0) FROM sales").fetchone()[0]
    total_fees = conn.execute("SELECT COALESCE(SUM(fees),0) FROM sales").fetchone()[0]
    total_profit = conn.execute("""
        SELECT COALESCE(SUM(s.sale_price - s.fees - COALESCE(p.purchase_price,0)),0)
        FROM sales s JOIN phones p ON s.phone_id=p.id
    """).fetchone()[0]

    in_stock_value = conn.execute("""
        SELECT COALESCE(SUM(purchase_price),0) FROM phones WHERE status='In Stock'
    """).fetchone()[0]

    total_purchase_cost = conn.execute("""
        SELECT COALESCE(SUM(purchase_price),0) FROM phones
    """).fetchone()[0]

    conn.close()

    return {
        "total_phones": total_phones,
        "total_revenue": round(total_revenue, 2),
        "total_fees": round(total_fees, 2),
        "total_profit": round(total_profit, 2),
        "in_stock_value": round(in_stock_value, 2),
        "total_purchase_cost": round(total_purchase_cost, 2),
        "last_atlas_sync": get_last_atlas_sync(),
    }

if __name__ == "__main__":
    init_db()
    print("DB initialized:", DB_PATH)