import json
import os

import backend
import director
from fastapi import HTTPException


class FakeResponse:
    def __init__(self, text):
        self.text = text


QUESTION = backend.Question(question="What is a variable?", history=[])


def valid_reply(fenced=False):
    payload = {
        "title": "Variables",
        "beats": [
            {"say": "What is a variable?", "show": "What is a variable", "role": "hook", "emphasis": ["variable"]},
            {"say": "A variable stores a value.", "show": "Stores a value", "role": "claim", "emphasis": ["value"]},
            {"say": "A name points to stored data.", "show": "Name: stored data", "role": "term", "emphasis": ["Name"]},
            {"say": "For example, a box can hold a value.", "show": "box | label", "role": "example", "emphasis": []},
            {"say": "The stored value can change.", "show": "Values can change", "role": "claim", "emphasis": ["change"]},
            {"say": "A variable is not a fixed number.", "show": "Not always a number", "role": "claim", "emphasis": []},
            {"say": "Variables help programs remember values.", "show": "Programs remember values", "role": "conclusion", "emphasis": ["remember"]},
        ],
    }
    text = json.dumps(payload)
    return f"```json\n{text}\n```" if fenced else text


def run_case(name, callback):
    original_generate = backend._generate
    original_models = backend.MODELS
    try:
        result = callback()
        print(f"{name}: {'ok' if result else 'FAIL'}")
        return result
    except Exception as error:
        print(f"{name}: FAIL ({error})")
        return False
    finally:
        backend._generate = original_generate
        backend.MODELS = original_models
        os.environ.pop("TEXT_MOCK", None)


def main():
    passed = True

    def mock_case():
        os.environ["TEXT_MOCK"] = "1"
        calls = []

        def fake(model, prompt, use_schema):
            calls.append((model, prompt))
            return FakeResponse("")

        backend._generate = fake
        result = backend.text_beats(QUESTION)
        return result["kind"] == "text" and result["data"]["beats"] and not calls

    passed &= run_case("mock mode", mock_case)

    def invalid_mode():
        os.environ["TEXT_MOCK"] = "2"
        try:
            backend.text_beats(QUESTION)
        except HTTPException as error:
            return error.status_code == 501
        return False

    passed &= run_case("invalid mock mode", invalid_mode)

    def real_case(reply, models=None, expected_calls=None):
        os.environ["TEXT_MOCK"] = "0"
        calls = []
        backend.MODELS = models or ["m1"]

        def fake(model, prompt, use_schema):
            calls.append((model, prompt))
            return FakeResponse(reply)

        backend._generate = fake
        result = backend.text_beats(QUESTION)
        valid = (
            result["kind"] == "text"
            and result["data"]["beats"]
            and all(
                beat["layout"] in director.VOCAB["layouts"]
                and beat["enter"] in director.VOCAB["enters"]
                and beat["exit"] in director.VOCAB["exits"]
                and beat["transition"] in director.VOCAB["transitions"]
                and beat["bg"] in director.VOCAB["bgs"]
                for beat in result["data"]["beats"]
            )
            and bool(json.dumps(result))
        )
        return valid and (expected_calls is None or len(calls) == expected_calls)

    passed &= run_case("real valid JSON", lambda: real_case(valid_reply(), expected_calls=1))
    passed &= run_case("real fenced JSON", lambda: real_case(valid_reply(True), expected_calls=1))

    def retry_case_proper():
        os.environ["TEXT_MOCK"] = "0"
        calls = []

        def fake(model, prompt, use_schema):
            calls.append((model, prompt))
            return FakeResponse("garbage" if len(calls) == 1 else valid_reply())

        backend.MODELS = ["m1"]
        backend._generate = fake
        result = backend.text_beats(QUESTION)
        return result["kind"] == "text" and len(calls) == 2

    passed &= run_case("same model retry", retry_case_proper)

    def all_garbage():
        os.environ["TEXT_MOCK"] = "0"
        calls = []
        backend.MODELS = ["m1", "m2", "m3"]
        backend._generate = lambda model, prompt, use_schema: (calls.append((model, prompt)) or FakeResponse("garbage"))
        try:
            backend.text_beats(QUESTION)
        except HTTPException as error:
            return error.status_code == 502 and len(calls) <= 3
        return False

    passed &= run_case("garbage fallback", all_garbage)

    def model_fallback():
        os.environ["TEXT_MOCK"] = "0"
        calls = []
        backend.MODELS = ["m1", "m2"]

        def fake(model, prompt, use_schema):
            calls.append((model, prompt))
            if model == "m1":
                raise Exception("429 RESOURCE_EXHAUSTED")
            return FakeResponse(valid_reply())

        backend._generate = fake
        result = backend.text_beats(QUESTION)
        return result["kind"] == "text" and [model for model, _ in calls] == ["m1", "m2"]

    passed &= run_case("model quota fallback", model_fallback)

    def quota_error():
        os.environ["TEXT_MOCK"] = "0"
        backend.MODELS = ["m1"]
        backend._generate = lambda model, prompt, use_schema: (_ for _ in ()).throw(Exception("429 RESOURCE_EXHAUSTED"))
        try:
            backend.text_beats(QUESTION)
        except HTTPException as error:
            return error.status_code == 429
        return False

    passed &= run_case("quota error", quota_error)

    def prompt_case():
        os.environ["TEXT_MOCK"] = "0"
        calls = []
        backend.MODELS = ["m1"]
        backend._generate = lambda model, prompt, use_schema: (calls.append((model, prompt)) or FakeResponse(valid_reply()))
        backend.text_beats(QUESTION)
        return "What is a variable?" in calls[0][1] and "ONLY raw JSON" in calls[0][1]

    passed &= run_case("prompt content", prompt_case)

    def reset_case():
        os.environ["TEXT_MOCK"] = "0"
        backend.MODELS = ["m1"]
        def fake(model, prompt, use_schema):
            raise ValueError("bad")
        backend._generate = fake
        try:
            backend.text_beats(QUESTION)
        except HTTPException:
            return backend._requests_used.get() == 0
        return False

    passed &= run_case("request counter reset", reset_case)

    def safe_error_case():
        os.environ["TEXT_MOCK"] = "0"
        backend.MODELS = ["m1"]
        errors = [ValueError("bad"), KeyError("bad")]
        for error in errors:
            backend._generate = lambda model, prompt, use_schema, error=error: (_ for _ in ()).throw(error)
            try:
                backend.text_beats(QUESTION)
            except HTTPException:
                continue
            return False
        backend._generate = lambda model, prompt, use_schema: FakeResponse(None)
        try:
            backend.text_beats(QUESTION)
        except HTTPException:
            return True
        return False

    passed &= run_case("safe route errors", safe_error_case)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
