import json
import os

import backend
import groq_client
from fastapi import HTTPException
from lesson import parse_lesson


QUESTION = backend.Question(question="How does email travel?", history=[])


def text_part():
    return {
        "type": "text",
        "beats": [
            {"say": "How does email travel?", "show": "EMAIL TRAVEL", "role": "hook", "emphasis": ["EMAIL"]},
            {"say": "Messages move through services.", "show": "Message services", "role": "claim", "emphasis": ["services"]},
        ],
    }


def diagram_part():
    return {
        "type": "diagram",
        "layout": "row",
        "objects": [{"type": "box", "text": "Sender"}, {"type": "box", "text": "Server"}],
        "links": [[0, 1]],
        "steps": [
            {"say": "The sender submits it.", "focus": [0]},
            {"say": "The server forwards it.", "focus": [1]},
            {"say": "The receiver reads it.", "focus": [1]},
            {"say": "The message arrives.", "focus": [1]},
            {"say": "The route is complete.", "focus": [1]},
        ],
    }


def valid_reply(fenced=False):
    value = {"title": "Email lesson", "parts": [text_part(), diagram_part(), text_part()]}
    raw = json.dumps(value)
    return f"```json\n{raw}\n```" if fenced else raw


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

    def success():
        setup()
        seen = []

        def fake(model, prompt, key, timeout=12, max_tokens=2000):
            seen.append((model, prompt, timeout, max_tokens))
            return valid_reply()

        groq_client.chat = fake
        result = backend.lesson(QUESTION)
        return result["kind"] == "lesson" and result["data"]["parts"][0]["kind"] == "text" and result["data"]["parts"][1]["kind"] == "diagram" and seen[0][2:] == (25, 3500)

    passed &= run_case("valid mixed lesson", success)
    def _fenced():
        setup()
        groq_client.chat = lambda *args, **kwargs: valid_reply(True)
        result = backend.lesson(QUESTION)
        return result["kind"] == "lesson"

    passed &= run_case("fenced lesson", _fenced)
    def diagram_only():
        setup()
        groq_client.chat = lambda *args, **kwargs: json.dumps({"title": "Only", "parts": [diagram_part()]})
        return backend.lesson(QUESTION) == {"kind": "none"}

    passed &= run_case("diagram only", diagram_only)

    def text_only():
        setup()
        groq_client.chat = lambda *args, **kwargs: json.dumps({"title": "Only", "parts": [text_part(), text_part()]})
        return backend.lesson(QUESTION) == {"kind": "none"}

    passed &= run_case("text only", text_only)

    def invalid_part():
        setup()
        value = {"title": "Mixed", "parts": [text_part(), {"type": "diagram", "objects": []}, diagram_part()]}
        groq_client.chat = lambda *args, **kwargs: json.dumps(value)
        result = backend.lesson(QUESTION)
        return result["kind"] == "lesson" and len(result["data"]["parts"]) == 2

    passed &= run_case("invalid diagram dropped", invalid_part)

    def second_model():
        setup()
        calls = []

        def fake(model, prompt, key, **kwargs):
            calls.append(model)
            return "garbage" if model == "m1" else valid_reply()

        groq_client.chat = fake
        return backend.lesson(QUESTION)["kind"] == "lesson" and calls == ["m1", "m2"]

    passed &= run_case("second model fallback", second_model)

    def quota():
        setup()
        groq_client.chat = lambda *args, **kwargs: (_ for _ in ()).throw(groq_client.GroqError(429, "quota"))
        try:
            backend.lesson(QUESTION)
        except HTTPException as error:
            return error.status_code == 429
        return False

    passed &= run_case("quota errors", quota)

    def server_error():
        setup()
        groq_client.chat = lambda *args, **kwargs: (_ for _ in ()).throw(groq_client.GroqError(500, "server"))
        return backend.lesson(QUESTION) == {"kind": "none"}

    passed &= run_case("server errors", server_error)

    def mock_mode():
        setup(mock="1")
        calls = []
        groq_client.chat = lambda *args, **kwargs: calls.append(args)
        return backend.lesson(QUESTION) == {"kind": "none"} and not calls

    passed &= run_case("mock mode", mock_mode)

    def missing_key():
        setup(key=None)
        calls = []
        groq_client.chat = lambda *args, **kwargs: calls.append(args)
        return backend.lesson(QUESTION) == {"kind": "none"} and not calls

    passed &= run_case("missing key", missing_key)

    def prompt_case():
        setup()
        prompts = []
        groq_client.chat = lambda model, prompt, key, **kwargs: (prompts.append(prompt) or "garbage")
        backend.lesson(backend.Question(question="x" * 5000, history=[]))
        prompt = prompts[0]
        return (
            len(prompt) < 5500
            and "diagram" in prompt.lower()
            and "hook" in prompt.lower()
            and "3 to 4 beats" in prompt
            and "never a label" in prompt.lower()
            and "ascii" in prompt.lower()
            and "10 to 20 words" in prompt
            and "never the literal word" in prompt.lower()
            and "4 to 6 shapes" in prompt
            and "same shape" in prompt.lower()
            and prompt.rfind("student message") > prompt.lower().rfind("rules")
        )

    passed &= run_case("prompt content and size", prompt_case)
    passed &= run_case("parser junk", lambda: all(parse_lesson(value) is None for value in (None, 5, "x", "{", "[]", '{"parts":5}')))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
