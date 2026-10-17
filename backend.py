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
        "You are a friendly programming tutor for beginners.\n"
        "Reply as JSON with two fields.\n"
        "spoken: what you would say out loud, 3 or 4 short sentences, maximum 60 words, plain text.\n"
        "scenes: the key on-screen lines for the explanation, 3 to 5 items in teaching order. "
        "Each scene has text (a short line of at most 8 words) and emphasis "
        "(1 or 2 important words copied exactly from that text).\n"
        "If the user message is only a greeting or small talk, give one friendly sentence in spoken "
        "and an empty scenes list.\n"
        f"User message: {q.question}"
    )
    try:
        interaction = client.interactions.create(
            model=MODEL,
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": Plan.model_json_schema(),
            },
        )
        plan = Plan.model_validate_json(interaction.output_text)
        return plan.model_dump()
    except Exception as e:
        print("Gemini error:", e)
        return {"spoken": "Sorry, I couldn't reach Gemini. Check the backend terminal.", "scenes": []}
class Scene(BaseModel):
    text: str
    emphasis: list[str]

class Plan(BaseModel):
    spoken: str
    scenes: list[Scene]