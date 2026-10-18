import json, os, urllib.request
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GROQ_API_KEY")
if not key:
    raise SystemExit("GROQ_API_KEY is missing in .env")
req = urllib.request.Request(
    "https://api.groq.com/openai/v1/models",
    headers={"Authorization": f"Bearer {key}", "User-Agent": "orb-agent/1.0"},
)
with urllib.request.urlopen(req, timeout=20) as r:
    data = json.load(r)
for m in data.get("data", []):
    print(m.get("id"))