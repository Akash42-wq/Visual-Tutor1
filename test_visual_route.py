import json
import os

import backend
import groq_client
from diagramgen import parse_diagram
from fastapi import HTTPException


QUESTION = backend.Question(question="How does a browser get a web page?", history=[])


def valid_reply(fenced=False):
    value = {
        "title": "Web page flow",
        "objects": [
            {"type": "box", "text": "Browser"},
            {"type": "box", "text": "Server"},
            {"type": "box", "text": "Database"},
        ],
        "links": [[0, 1], [1, 2]],
        "steps": [
            {"say": "The browser asks.", "focus": [0]},
            {"say": "The server responds.", "focus": [1]},
        ],
    }
    text = json.dumps(value)
    return f"```json\n{text}\n```" if fenced else text


def run_case(name, callback):
    original_chat = groq_client.chat
    saved = {key: os.environ.get(key) for key in ("GROQ_API_KEY", "TEXT_MOCK", "GROQ_MODELS")}
    try:
        result = callback()
        print(f"{name}: {'ok' if result else 'FAIL'}")
        return result
    except Exception as error:
        print(f"{name}: FAIL ({error})")
        return False
    finally:
        groq_client.chat = original_chat
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def setup(key="test-key", mock="0", models="m1,m2"):
    os.environ["TEXT_MOCK"] = mock
    os.environ["GROQ_MODELS"] = models
    if key is None:
        os.environ.pop("GROQ_API_KEY", None)
    else:
        os.environ["GROQ_API_KEY"] = key


def main():
    passed = True

    def mock_mode():
        setup(mock="1")
        calls = []
        groq_client.chat = lambda *args: calls.append(args)
        return backend.visual(QUESTION) == {"kind": "none"} and not calls

    passed &= run_case("mock mode", mock_mode)

    def missing_key():
        setup(key=None)
        groq_client.chat = lambda *args: (_ for _ in ()).throw(AssertionError("Groq called"))
        return backend.visual(QUESTION) == {"kind": "none"}

    passed &= run_case("missing key", missing_key)

    def valid():
        setup()
        groq_client.chat = lambda model, prompt, key: valid_reply()
        result = backend.visual(QUESTION)
        data = result.get("data", {})
        return bool(result["kind"] == "diagram" and data["objects"] and data["arrows"] and data["steps"])

    passed &= run_case("valid diagram", valid)

    def fenced():
        setup()
        groq_client.chat = lambda model, prompt, key: valid_reply(True)
        return backend.visual(QUESTION)["kind"] == "diagram"

    passed &= run_case("fenced diagram", fenced)

    def none_reply():
        setup()
        calls = []
        groq_client.chat = lambda model, prompt, key: (calls.append(model) or '{"diagram":"none"}')
        return backend.visual(QUESTION) == {"kind": "none"} and calls == ["m1"]

    passed &= run_case("explicit none", none_reply)

    def second_model():
        setup()
        calls = []

        def fake(model, prompt, key):
            calls.append(model)
            return "garbage" if model == "m1" else valid_reply()

        groq_client.chat = fake
        return backend.visual(QUESTION)["kind"] == "diagram" and calls == ["m1", "m2"]

    passed &= run_case("second model fallback", second_model)

    def both_garbage():
        setup()
        calls = []
        groq_client.chat = lambda model, prompt, key: (calls.append(model) or "garbage")
        return backend.visual(QUESTION) == {"kind": "none"} and len(calls) <= 2

    passed &= run_case("garbage fallback", both_garbage)

    def quota():
        setup()
        calls = []

        def fake(model, prompt, key):
            calls.append(model)
            raise groq_client.GroqError(429, "quota")

        groq_client.chat = fake
        try:
            backend.visual(QUESTION)
        except HTTPException as error:
            return error.status_code == 429 and len(calls) == 2
        return False

    passed &= run_case("quota errors", quota)

    def server_error():
        setup()
        groq_client.chat = lambda model, prompt, key: (_ for _ in ()).throw(groq_client.GroqError(500, "server"))
        return backend.visual(QUESTION) == {"kind": "none"}

    passed &= run_case("server errors", server_error)

    def prompt_case():
        setup()
        prompts = []
        groq_client.chat = lambda model, prompt, key: (prompts.append(prompt) or '{"diagram":"none"}')
        result = backend.visual(backend.Question(question="x" * 5000, history=[]))
        prompt = prompts[0]
        lower = prompt.lower()
        return result == {"kind": "none"} and "x" * 500 in prompt and len(prompt) < 3000 and prompt.rfind("student message") > lower.rfind("rules")

    passed &= run_case("prompt safety and size", prompt_case)

    junk = [parse_diagram(value) for value in (None, 5, "x", "{", "[]")]
    passed &= run_case("parser junk", lambda: all(value is None for value in junk))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
