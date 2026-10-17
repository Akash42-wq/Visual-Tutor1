from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai

load_dotenv()  # reads GEMINI_API_KEY from the .env file

MODEL = "gemini-3.8-flash"  # name from the current docs, check AI Studio if it errors

client = genai.Client()  # picks up GEMINI_API_KEY from the environment
app = FastAPI()

# lets your page (port 5500) talk to this server (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class Question(BaseModel):
    question: str

@app.get("/")
def hello():
    return {"message": "hello from the backend"}

@app.post("/explain")
def explain(q: Question):
    prompt = (
        "You are a friendly programming tutor speaking out loud to a beginner. "
        "If the message is a greeting or small talk, reply in one short friendly sentence "
        "and ask what concept they want to learn. "
        "If it is a programming or computer science topic, explain it in 3 or 4 short, "
        "spoken-style sentences, maximum 60 words. "
        "Plain text only: no markdown, no lists, no code blocks. "
        f"User message: {q.question}"
    )
    try:
        interaction = client.interactions.create(model=MODEL, input=prompt)
        return {"text": interaction.output_text}
    except Exception as e:
        print("Gemini error:", e)
        return {"text": "Sorry, I couldn't reach Gemini. Check the backend terminal for the error."}