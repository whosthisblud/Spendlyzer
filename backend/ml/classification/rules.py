"""Keyword fallback used when the per-user model is untrained or not reliable."""
import re

# category name -> keywords (lowercase). Names match the default categories.
EXPENSE_RULES: dict[str, tuple[str, ...]] = {
    "Food & Dining": ("swiggy", "zomato", "restaurant", "cafe", "dominos", "pizza", "mcdonald", "kfc",
                      "starbucks", "burger", "biryani", "eatsure", "chai", "canteen", "dhaba"),
    "Groceries": ("bigbasket", "blinkit", "zepto", "dmart", "grofers", "jiomart", "grocery", "kirana",
                  "supermarket", "more retail", "reliance fresh", "instamart", "vegetables", "milk"),
    "Transport": ("uber", "ola", "rapido", "metro", "petrol", "diesel", "fuel", "fastag", "parking",
                  "auto rickshaw", "cab", "bus pass", "toll"),
    "Shopping": ("amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "croma", "decathlon",
                 "lifestyle", "shoppers stop", "ikea"),
    "Bills & Utilities": ("electricity", "bescom", "msedcl", "tata power", "water bill", "gas bill",
                          "jio", "airtel", "vi recharge", "vodafone", "bsnl", "broadband", "recharge",
                          "postpaid", "act fibernet", "dth", "lpg", "indane"),
    "Rent": ("rent", "pg ", "hostel", "landlord", "nobroker"),
    "Subscriptions": ("netflix", "spotify", "prime video", "amazon prime", "hotstar", "youtube premium",
                      "apple.com", "icloud", "google one", "chatgpt", "jiocinema", "sonyliv", "zee5"),
    "Entertainment": ("bookmyshow", "pvr", "inox", "steam", "playstation", "concert", "gaming"),
    "Health": ("pharmacy", "apollo", "medplus", "1mg", "pharmeasy", "hospital", "clinic", "doctor",
               "diagnostic", "lab test", "gym", "cult.fit", "netmeds"),
    "Education": ("udemy", "coursera", "college fee", "tuition", "course", "books", "exam fee",
                  "unacademy", "byju", "school fee", "semester"),
    "Travel": ("makemytrip", "goibibo", "irctc", "indigo", "air india", "vistara", "spicejet", "akasa",
               "hotel", "oyo", "airbnb", "redbus", "cleartrip", "yatra"),
}

INCOME_RULES: dict[str, tuple[str, ...]] = {
    "Salary": ("salary", "payroll", "stipend", "sal credit"),
    "Freelance": ("freelance", "upwork", "fiverr", "invoice", "consulting", "client payment"),
    "Investments": ("dividend", "interest", "mutual fund", "redemption", "zerodha", "groww", "fd maturity"),
    "Refunds": ("refund", "cashback", "reversal"),
    "Gifts": ("gift", "birthday"),
}


def _normalize(text: str) -> str:
    return " " + re.sub(r"[^a-z0-9.& ]+", " ", text.lower()) + " "


def match_rule(description: str, txn_type: str) -> str | None:
    text = _normalize(description)
    rules = INCOME_RULES if txn_type == "income" else EXPENSE_RULES
    for category, keywords in rules.items():
        for kw in keywords:
            if kw in text:
                return category
    return None
