"""eBay Browse API integration for phone flip dashboard."""
import json, base64, time, os
from pathlib import Path

CLIENT_ID = os.getenv("EBAY_CLIENT_ID", "").strip()
CLIENT_SECRET = os.getenv("EBAY_CLIENT_SECRET", "").strip()
TOKEN_PATH = Path(__file__).parent / ".ebay_token.json"

# Condition IDs from eBay Browse API
CONDITION_MAP = {
    "NEW": 1000,
    "LIKE_NEW": 2000,
    "VERY_GOOD": 3000,
    "GOOD": 4000,
    "ACCEPTABLE": 5000,
    "USED": 2500,  # Used is a broader category
}

def get_access_token():
    """Get eBay OAuth token with local caching."""
    # Check cache
    if TOKEN_PATH.exists():
        try:
            cached = json.loads(TOKEN_PATH.read_text())
            if cached.get("expires_at", 0) > time.time() + 60:
                return cached["access_token"]
        except Exception:
            pass

    # Get new token
    if not CLIENT_ID or not CLIENT_SECRET:
        raise RuntimeError("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be configured")
    auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    data = "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope".encode()
    
    import urllib.request
    req = urllib.request.Request(
        "https://api.ebay.com/identity/v1/oauth2/token",
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {auth}"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read())
        token = body["access_token"]
        expires_in = body.get("expires_in", 7200)
        
    # Cache
    TOKEN_PATH.write_text(json.dumps({
        "access_token": token,
        "expires_at": time.time() + expires_in
    }))
    return token


def search_ebay(model: str, condition: str = "USED", limit: int = 5) -> list[dict]:
    """Search eBay for active listings of a phone model."""
    token = get_access_token()
    
    import urllib.request
    
    # Build query - combine model with condition and storage
    query = f"{model} {condition}".strip()
    
    # Build filter for condition
    condition_id = CONDITION_MAP.get(condition.upper(), 2500)
    filter_str = f"condition:{condition_id}"
    
    url = (
        f"https://api.ebay.com/buy/browse/v1/item_summary/search?"
        f"q={urllib.request.quote(query)}"
        f"&filter={filter_str}"
        f"&limit={limit}"
        f"&sort=price%3Aasc"
    )
    
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            "Content-Type": "application/json"
        },
        method="GET"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            items = data.get("itemSummaries", [])
            return [
                {
                    "title": i.get("title", ""),
                    "price": float(i.get("price", {}).get("value", 0)),
                    "currency": i.get("price", {}).get("currency", "USD"),
                    "condition": i.get("condition", ""),
                    "conditionId": i.get("conditionId", ""),
                    "itemUrl": i.get("itemWebUrl", ""),
                    "sellerFeedback": i.get("sellerFeedbackPercentage", "N/A"),
                    "topRated": i.get("topRatedBuyingExperience", False),
                }
                for i in items
            ]
    except Exception as e:
        return {"error": str(e)}


def get_ebay_price_for_model(model: str, condition: str = "Grade A") -> dict:
    """Get typical eBay price for a phone model + condition.
    
    Maps our 'Grade A/B/C/D' to eBay's condition system and returns
    price stats (low/avg/high) from active listings.
    """
    # Map our grade to eBay condition
    grade_to_ebay = {
        "Grade A": "VERY_GOOD",
        "Grade B": "GOOD", 
        "Grade C": "ACCEPTABLE",
        "Grade D": "USED",
        "NEW": "NEW",
    }
    
    eb_cond = grade_to_ebay.get(condition, "VERY_GOOD")
    
    results = search_ebay(model, eb_cond, limit=10)
    
    if isinstance(results, dict) and "error" in results:
        return {"error": results["error"]}
    
    if not results:
        return {"price": None, "count": 0, "error": "No listings found"}
    
    prices = [r["price"] for r in results]
    
    return {
        "count": len(prices),
        "lowest": min(prices),
        "highest": max(prices),
        "average": round(sum(prices) / len(prices), 2),
        "listings": results,
    }


def calculate_margin(purchase_price: float, sell_price: float, fees_pct: float = 13.25) -> dict:
    """Calculate net margin after eBay fees.
    
    eBay final value fee ~13.25% for electronics.
    PayPal (if used) ~2.9% + $0.30
    """
    gross_margin = sell_price - purchase_price
    
    # eBay fees (final value fee ~13.25%)
    ebay_fees = sell_price * (fees_pct / 100)
    net_proceed = sell_price - ebay_fees
    net_margin = net_proceed - purchase_price
    
    return {
        "gross_margin": round(gross_margin, 2),
        "net_margin": round(net_margin, 2),
        "fees": round(ebay_fees, 2),
        "net_proceed": round(net_proceed, 2),
        "margin_pct": round((net_margin / purchase_price) * 100, 1) if purchase_price > 0 else 0,
    }