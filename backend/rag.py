"""RAG knowledge base for phone flip dashboard chat.

Uses BM25 similarity to retrieve relevant context from:
- Inventory (phones in stock with purchase prices)
- Atlas prices (buyback prices by model + condition)
- Recent sales (what sold, for how much, margins)
"""
import re
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

from rank_bm25 import BM25Okapi

DB_PATH = Path(__file__).parent / "inventory.db"

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class InventoryChunk:
    """A phone in inventory."""
    id: int
    model: str
    storage: str
    condition: str
    carrier: str
    purchase_price: float
    status: str
    text: str

@dataclass
class AtlasPriceChunk:
    """An Atlas buyback price entry."""
    device_name: str
    condition: str
    price: float
    text: str

@dataclass
class SalesChunk:
    """A recent sale with margin info."""
    id: int
    model: str
    condition: str
    sale_price: float
    purchase_price: float
    margin: float
    platform: str
    text: str

@dataclass
class KnowledgeBase:
    """All RAG chunks + BM25 index."""
    inventory_chunks: list[InventoryChunk] = field(default_factory=list)
    atlas_chunks: list[AtlasPriceChunk] = field(default_factory=list)
    sales_chunks: list[SalesChunk] = field(default_factory=list)
    _inventory_bm25: Optional[BM25Okapi] = None
    _atlas_bm25: Optional[BM25Okapi] = None
    _sales_bm25: Optional[BM25Okapi] = None

    def build_indexes(self):
        inv_texts = [c.text.split() for c in self.inventory_chunks]
        atlas_texts = [c.text.split() for c in self.atlas_chunks]
        sales_texts = [c.text.split() for c in self.sales_chunks]
        self._inventory_bm25 = BM25Okapi(inv_texts) if inv_texts else None
        self._atlas_bm25 = BM25Okapi(atlas_texts) if atlas_texts else None
        self._sales_bm25 = BM25Okapi(sales_texts) if sales_texts else None

    def retrieve(self, query: str, top_k: int = 5) -> dict:
        """Retrieve top-k relevant chunks for each category."""
        results = {"inventory": [], "atlas": [], "sales": []}
        if not query.strip():
            return results

        # Extract meaningful query terms (filter stopwords, keep model/brand words)
        stopwords = {"a", "an", "the", "is", "are", "do", "does", "did", "what", "which", "who",
                     "whom", "this", "that", "these", "those", "i", "you", "we", "they", "he",
                     "she", "it", "in", "on", "at", "to", "for", "of", "with", "by", "from",
                     "and", "or", "but", "if", "then", "so", "as", "up", "out", "how", "much",
                     "many", "some", "all", "any", "have", "has", "had", "my", "your", "our"}
        query_words = [w.lower() for w in re.findall(r"\w+", query) if w.lower() not in stopwords]

        def chunk_relevance_score(c, bm25_score: float, attr="text") -> float:
            """Hybrid score: BM25 + keyword/phrase match bonus."""
            text = getattr(c, attr).lower()
            # Count how many query words appear in the chunk
            word_matches = sum(1 for w in query_words if w in text)
            word_bonus = word_matches * 0.5
            # Phrase match bonus: detect model name matches
            phrase_bonus = 0.0
            for w in query_words:
                if len(w) >= 4 and w in text:
                    phrase_bonus += 0.3
            return bm25_score + word_bonus + phrase_bonus

        def combined_retrieval(chunks, bm25_index, attr="text"):
            """Combine BM25 + keyword boost, sorted by relevance."""
            if not chunks or not bm25_index:
                return []
            bm25_scores = bm25_index.get_scores(query.split())
            # Score all chunks with hybrid scoring
            scored = []
            for i, c in enumerate(chunks):
                hybrid = chunk_relevance_score(c, bm25_scores[i], attr)
                scored.append((c, hybrid))
            # Sort by hybrid score and take top_k
            scored.sort(key=lambda x: x[1], reverse=True)
            return [c for c, _ in scored[:top_k]]

        if self._inventory_bm25 and self.inventory_chunks:
            results["inventory"] = combined_retrieval(self.inventory_chunks, self._inventory_bm25)

        if self._atlas_bm25 and self.atlas_chunks:
            results["atlas"] = combined_retrieval(self.atlas_chunks, self._atlas_bm25)

        if self._sales_bm25 and self.sales_chunks:
            results["sales"] = combined_retrieval(self.sales_chunks, self._sales_bm25)

        return results

    def as_context_text(self, query: str, top_k: int = 5) -> str:
        """Build a formatted context string for a query."""
        chunks = self.retrieve(query, top_k=top_k)
        lines = []

        if chunks["inventory"]:
            lines.append("=== CURRENT INVENTORY ===")
            for c in chunks["inventory"]:
                carrier_str = f" ({c.carrier})" if c.carrier else ""
                lines.append(f"- {c.model} {c.storage}{carrier_str}, {c.condition}, purchased at ${c.purchase_price:.2f} [{c.status}]")
            lines.append("")

        if chunks["atlas"]:
            lines.append("=== ATLAS BUYWACK PRICES ===")
            for c in chunks["atlas"]:
                lines.append(f"- {c.device_name}, {c.condition}: ${c.price:.2f}")
            lines.append("")

        if chunks["sales"]:
            lines.append("=== RECENT SALES ===")
            for c in chunks["sales"]:
                margin_pct = (c.margin / c.purchase_price * 100) if c.purchase_price > 0 else 0
                lines.append(f"- {c.model} sold for ${c.sale_price:.2f} (margin: ${c.margin:.2f}, {margin_pct:.0f}%) on {c.platform}")
            lines.append("")

        # ── eBay pricing (if query mentions eBay or margins) ──────────────────
        query_lower = query.lower()
        if any(kw in query_lower for kw in ["ebay", "sell on", "resell", "true margin", "compare", "which platform", "market price"]):
            try:
                import sys
                sys.path.insert(0, str(Path(__file__).parent))
                import ebay
                
                # Extract model names from inventory chunks
                models = list({c.model for c in chunks["inventory"]})[:3]
                for model in models:
                    if model:
                        result = ebay.get_ebay_price_for_model(model, "Grade A")
                        if isinstance(result, dict) and "error" not in result:
                            fees = result["average"] * 0.1325 if result.get("average") else 0
                            net = result["average"] - fees if result.get("average") else None
                            lines.append(f"=== EBAY ACTIVE LISTINGS: {model} ===")
                            lines.append(f"  Range: ${result['lowest']:.2f} – ${result['highest']:.2f} | Avg: ${result['average']:.2f}")
                            if fees and net:
                                lines.append(f"  After 13.25% eBay fees: net ~${net:.2f}")
                            lines.append("")
            except Exception:
                pass

        return "\n".join(lines)


# ── Global KB instance ───────────────────────────────────────────────────────

_kb: Optional[KnowledgeBase] = None


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _build_inventory_chunks() -> list[InventoryChunk]:
    conn = _get_db()
    phones = conn.execute(
        "SELECT id, model, storage, carrier, condition, purchase_price, status FROM phones ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    chunks = []
    for p in phones:
        model = p["model"] or "Unknown"
        storage = p["storage"] or ""
        condition = p["condition"] or "Grade A"
        carrier = p["carrier"] or ""
        price = p["purchase_price"] or 0.0
        status = p["status"] or "In Stock"
        text = f"{model} {storage} {condition} {carrier} purchased {price}".lower()
        chunks.append(InventoryChunk(
            id=p["id"],
            model=model,
            storage=storage,
            condition=condition,
            carrier=carrier,
            purchase_price=price,
            status=status,
            text=text,
        ))
    return chunks


def _build_atlas_chunks() -> list[AtlasPriceChunk]:
    conn = _get_db()
    rows = conn.execute(
        "SELECT device_name, condition, price FROM atlas_snapshots ORDER BY device_name"
    ).fetchall()
    conn.close()
    chunks = []
    for r in rows:
        name = r["device_name"] or ""
        condition = r["condition"] or ""
        price = r["price"] or 0.0
        text = f"{name} {condition} {price}".lower()
        chunks.append(AtlasPriceChunk(
            device_name=name,
            condition=condition,
            price=price,
            text=text,
        ))
    return chunks


def _build_sales_chunks() -> list[SalesChunk]:
    conn = _get_db()
    rows = conn.execute("""
        SELECT s.id, s.sale_price, s.platform, p.model, p.condition, p.purchase_price
        FROM sales s JOIN phones p ON s.phone_id=p.id
        ORDER BY s.sale_date DESC
        LIMIT 50
    """).fetchall()
    conn.close()
    chunks = []
    for r in rows:
        model = r["model"] or "Unknown"
        condition = r["condition"] or ""
        sale_price = r["sale_price"] or 0.0
        purchase_price = r["purchase_price"] or 0.0
        margin = sale_price - purchase_price
        platform = r["platform"] or "Atlas"
        text = f"{model} sold {sale_price} margin {margin} {condition}".lower()
        chunks.append(SalesChunk(
            id=r["id"],
            model=model,
            condition=condition,
            sale_price=sale_price,
            purchase_price=purchase_price,
            margin=margin,
            platform=platform,
            text=text,
        ))
    return chunks


def build_knowledge_base() -> KnowledgeBase:
    """Build a fresh knowledge base from the current DB state."""
    kb = KnowledgeBase(
        inventory_chunks=_build_inventory_chunks(),
        atlas_chunks=_build_atlas_chunks(),
        sales_chunks=_build_sales_chunks(),
    )
    kb.build_indexes()
    return kb


def get_kb() -> KnowledgeBase:
    """Get the global KB instance, building it if needed."""
    global _kb
    if _kb is None:
        _kb = build_knowledge_base()
    return _kb


def refresh_kb():
    """Rebuild the global KB from current DB state."""
    global _kb
    _kb = build_knowledge_base()
