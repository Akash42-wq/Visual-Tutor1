from dotenv import load_dotenv
from google import genai

load_dotenv()
client = genai.Client()  # reads GEMINI_API_KEY from .env, never printed
for m in client.models.list():
    if "gemini" in m.name:
        print(m.name, getattr(m, "supported_actions", ""))