# Visual tutor
A talking orb that animates what it says 
Build step by step with git
#Visual tutor

A voice-led animated AI explainer. Ask a question by typing or speaking, and a glass orb steps aside while a short animated lesson plays: text beats, shape diagrams with arrows, and a spoken voice. The orb returns when it ends.

## How it works

1. You ask a question (text or mic).
2. The backend makes **one call to a free Groq model**, which writes the whole lesson as structured JSON: text beats, diagrams, a term, a contrast and a conclusion.
3. **Python validates everything and does all the layout.** The AI never writes coordinates, timing or animation code. It only picks content and choices from a fixed vocabulary.
4. The plain HTML/JS frontend plays the lesson: animated text, boxes, circles and arrows, and a voice.
5. If the lesson fails, it falls back to text-only beats, and if that fails, a clear error message shows. There are no blank screens.

## Features

- Mixed lessons: text beats, diagrams, terms, contrasts, numbers, examples and a conclusion
- 5 diagram layouts chosen to fit the idea: row, column, snake, hub, cycle
- Shapes: circle, box and label, joined by animated arrows
- Voice input with the browser mic (Chrome or Edge), and voice output with the browser voice
- Small-talk replies without any AI call
- Offline demo buttons: Beats, Diagram, Array, Text, Chain, Shapes and Lesson
- Offline tests for every backend part (no real network calls)

## Tech stack

- **Frontend:** plain HTML, CSS and JavaScript, with no libraries
- **Backend:** Python, FastAPI and uvicorn
- **AI:** Groq free models (`openai/gpt-oss-120b`, with Llama fallbacks)
- **Backend code uses the standard library only** for new modules (urllib, json, re)

## Run it

1. Create and activate a virtual environment:
   `python -m venv .venv`, then `.venv\Scripts\activate` on Windows
2. Install the packages: `pip install -r requirements.txt`
3. Create a `.env` file in the project folder (never commit it):
```
   GROQ_API_KEY=your_key_here
   TEXT_MOCK=0
   TEXT_PROVIDERS=groq
```
4. Start the backend: `uvicorn backend:app`
5. Serve the frontend with the VS Code Live Server extension at `http://127.0.0.1:5500`, and open it in Chrome.

Get a free Groq key at console.groq.com. Free limits are small (about one lesson per minute), so don't spam it.

## Tests

Run these with the venv active. Each prints `ok` or `FAIL`:
`python test_director.py`, `test_registry.py`, `test_textgen.py`, `test_groq.py`, `test_text_route.py`, `test_diagrams.py`, `test_visual_route.py`, `test_lesson.py`

## Project layout

- `backend.py` has the API routes (`/lesson`, `/text`, `/visual` and the demo routes)
- `lesson.py` has the lesson prompt and validator
- `diagrams.py` and `diagramgen.py` have the diagram builder and its prompt
- `director.py`, `registry.py` and `textgen.py` handle text beats
- `groq_client.py` is the Groq client
- `script.js` and `text-engine.js` handle playback
- `HANDOFF.md` has the full project notes

## Status

Working: live lessons, diagram layouts, error handling, offline tests and demo buttons.
Known gaps: the voice is the browser voice (robotic and slightly late), arrows can go missing on branching diagrams, and lessons can feel similar to each other.

## Roadmap

- Better and faster voice, with prefetched audio so it never lags the animation
- Arrow fix for branching diagrams
- A logger and scorer to measure variety between lessons
- More shapes, added one at a time
- Camera moves, persistent objects across scenes and streaming

## Notes

- Needs internet for Groq, the mic and the voice.
- The array, chain and shapes demos are hand-written samples. The lessons are AI-generated.
