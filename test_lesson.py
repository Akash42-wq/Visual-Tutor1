import json
import os

import backend
import groq_client
import lesson
from fastapi import HTTPException
from lesson import BLUEPRINTS, HOOKS, build_lesson_prompt, parse_lesson, pick_blueprint, pick_hook


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
            and "size for this lesson" in prompt.lower()
            and "never a label" in prompt.lower()
            and "ascii" in prompt.lower()
            and "10 to 20 words" in prompt
            and "never the literal word" in prompt.lower()
            and "shapes" in prompt.lower()
            and "same shape" in prompt.lower()
            and prompt.rfind("student message") > prompt.lower().rfind("rules")
        )

    passed &= run_case("prompt content and size", prompt_case)
    def ascii_reply():
        value = json.loads(valid_reply())
        value["title"] = "Café \u2011 \u2192"
        value["parts"][0]["beats"][0]["show"] = "Café \u2011 \u2192"
        value["parts"][1]["objects"][0]["text"] = "Nœde"
        result = parse_lesson(json.dumps(value, ensure_ascii=False))

        def all_ascii(item):
            if isinstance(item, str):
                return item.isascii()
            if isinstance(item, dict):
                return all(all_ascii(value) for value in item.values())
            if isinstance(item, list):
                return all(all_ascii(value) for value in item)
            return True

        return result is not None and all_ascii(result)

    passed &= run_case("ascii output", ascii_reply)

    def equation_role():
        value = json.loads(valid_reply())
        value["parts"][0]["beats"][0]["role"] = "number"
        value["parts"][0]["beats"][0]["show"] = "6CO2 + 6H2O -> sugar"
        result = parse_lesson(json.dumps(value))
        return result is not None and result["parts"][0]["data"]["beats"][0]["role"] == "claim"

    passed &= run_case("equation becomes claim", equation_role)

    def normal_number():
        value = json.loads(valid_reply())
        value["parts"][0]["beats"][0]["role"] = "number"
        value["parts"][0]["beats"][0]["show"] = "40% faster"
        result = parse_lesson(json.dumps(value))
        return result is not None and result["parts"][0]["data"]["beats"][0]["role"] == "number"

    passed &= run_case("plain number stays number", normal_number)

    def number_prompt():
        setup()
        prompts = []
        groq_client.chat = lambda model, prompt, key, **kwargs: (prompts.append(prompt) or "garbage")
        backend.lesson(backend.Question(question="x" * 5000, history=[]))
        prompt = prompts[0]
        return "single plain figure" in prompt and "never an equation or a formula" in prompt and len(prompt) < 5500

    passed &= run_case("number prompt rule", number_prompt)
    def blueprint_selection():
        return pick_blueprint("cats vs dogs") == "compare"

    passed &= run_case("compare blueprint", blueprint_selection)

    def blueprint_no_repeat():
        names = [pick_blueprint("general topic") for _ in range(20)]
        return all(left != right for left, right in zip(names, names[1:]))

    passed &= run_case("blueprint no immediate repeat", blueprint_no_repeat)

    def blueprint_reachability():
        names = {pick_blueprint("general topic") for _ in range(100)}
        return set(BLUEPRINTS) <= names

    passed &= run_case("all blueprints reachable", blueprint_reachability)

    def blueprint_junk():
        return all(pick_blueprint(value) in BLUEPRINTS for value in (None, 5, ""))

    passed &= run_case("blueprint junk input", blueprint_junk)

    def blueprint_prompt():
        prompt = build_lesson_prompt("x" * 5000)
        return (
            "STRUCTURE for this lesson" in prompt
            and prompt.count("Worked example:") == 1
            and len(prompt) < 5500
            and "Never put two diagrams in a row." in prompt
            and "ends with a conclusion beat." in prompt
            and prompt.rfind("Student message:") > prompt.rfind("Rules above")
        )

    passed &= run_case("blueprint prompt", blueprint_prompt)
    def blueprint_sizes():
        original_picker = lesson.pick_blueprint
        try:
            for name in BLUEPRINTS:
                lesson.pick_blueprint = lambda question, selected=name: selected
                prompt = build_lesson_prompt("x" * 5000)
                if "SIZE for this lesson:" not in prompt or len(prompt) >= 5500:
                    return False
            return True
        finally:
            lesson.pick_blueprint = original_picker

    passed &= run_case("all blueprint sizes", blueprint_sizes)

    def specific_sizes():
        original_picker = lesson.pick_blueprint
        try:
            lesson.pick_blueprint = lambda question: "quick"
            quick = build_lesson_prompt("topic")
            lesson.pick_blueprint = lambda question: "deep"
            deep = build_lesson_prompt("topic")
            return "3 parts" in quick and "6 to 8 steps" not in quick and "5 parts" in deep
        finally:
            lesson.pick_blueprint = original_picker

    passed &= run_case("specific blueprint sizes", specific_sizes)

    def hook_selection():
        hooks = [pick_hook() for _ in range(20)]
        return (
            all(left != right for left, right in zip(hooks, hooks[1:]))
            and set(HOOKS) <= set(hooks)
        )

    passed &= run_case("hook selection", hook_selection)

    def hook_prompt():
        return "FIRST BEAT STYLE:" in build_lesson_prompt("topic")

    passed &= run_case("hook prompt", hook_prompt)
    passed &= run_case("parser junk", lambda: all(parse_lesson(value) is None for value in (None, 5, "x", "{", "[]", '{"parts":5}')))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
