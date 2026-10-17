from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from pathlib import Path

load_dotenv()  # reads GEMINI_API_KEY from the .env file

MODEL = "gemini-3.8-flash"  # name from the current docs, check AI Studio if it errors

client = genai.Client()  # picks up GEMINI_API_KEY from the environment
app = FastAPI()

# kept so the old frontend doesn't break while you rewrite it; delete later if unused
IMAGE_DIR = Path("images")
IMAGE_DIR.mkdir(exist_ok=True)
app.mount("/images", StaticFiles(directory="images"), name="images")

# lets your page (port 5500) talk to this server (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- data shapes ----------

class Question(BaseModel):
    question: str

class Diagram(BaseModel):
    type: Literal["array", "none"]   # add "stack", "flow" here as you build them
    items: list[str]                 # the array at the START of the scene

class Step(BaseModel):
    say: str
    highlight: list[int]
    items: list[str]                 # full array after this step; [] means no change

class Scene(BaseModel):
    title: str
    diagram: Diagram
    steps: list[Step]

class Plan(BaseModel):
    scenes: list[Scene]


# ---------- validation ----------

def clean(plan: Plan) -> list[Scene]:
    good = []
    for sc in plan.scenes:
        n = len(sc.diagram.items)
        if sc.diagram.type == "none" or n == 0:
            sc.diagram = Diagram(type="none", items=[])
            n = 0
        steps = []
        for st in sc.steps:
            if not st.say.strip():
                continue                                             # empty line, drop the step
            if len(st.items) != n:
                st.items = []                                        # wrong length, ignore the change
            st.highlight = [i for i in st.highlight if 0 <= i < n]   # drop bad indexes
            steps.append(st)
        if steps:
            sc.steps = steps
            good.append(sc)
    return good


# ---------- routes ----------

@app.get("/")
def hello():
    return {"message": "hello from the backend"}

@app.post("/explain")
def explain(q: Question):
    prompt = (
        "You are a friendly programming tutor for beginners.\n"
        "Reply as JSON: {scenes: [...]}.\n"
        "Each scene has: title (max 5 words), "
        "diagram {type, items}, and steps.\n"
        "diagram.type is 'array' when the idea is a list of values, otherwise 'none' "
        "with an empty items list. Array items are short strings, at most 8 of them.\n"
        "diagram.items is the array as it looks at the START of the scene, before any step.\n"
        "Each step has: say (one plain sentence, max 20 words, spoken aloud), "
        "highlight (list of array indexes to emphasise while saying it, empty if none), and "
        "items. items is the full array AFTER this step if the step changes a value "
        "(for example a value is replaced or two values swap); otherwise an empty list. "
        "When items is not empty it must have exactly the same length as diagram.items. "
        "Highlight indexes must exist in the array.\n"
        "Use 1 to 4 scenes and 2 to 4 steps per scene, in teaching order.\n"
        "If the user message is only a greeting or small talk, return one scene with "
        "type 'none' and one step.\n"
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
        scenes = clean(plan)
        if not scenes:
            raise ValueError("Gemini returned no usable scenes")
        return {"scenes": [s.model_dump() for s in scenes]}
    except Exception as e:
        print("Gemini error:", e)
        return {"scenes": [{
            "title": "Error",
            "diagram": {"type": "none", "items": []},
            "steps": [{"say": "Sorry, I couldn't reach Gemini.", "highlight": [], "items": []}],
        }]}