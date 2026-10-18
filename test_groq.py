import io
import json
import os
import urllib.error
import urllib.request
from contextlib import redirect_stdout

import backend
import groq_client
from fastapi import HTTPException


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.payload


def valid_reply():
    return json.dumps({
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
    })


def run_client_case(name, callback):
    original_urlopen = urllib.request.urlopen
    try:
        result = callback()
        print(f"{name}: {'ok' if result else 'FAIL'}")
        return result
    except Exception as error:
        print(f"{name}: FAIL ({error})")
        return False
    finally:
        urllib.request.urlopen = original_urlopen


def run_route_case(name, callback):
    original_chat = groq_client.chat
    original_generate = backend._generate
    original_models = backend.MODELS
    saved = {key: os.environ.get(key) for key in ("GROQ_API_KEY", "TEXT_PROVIDERS", "GROQ_MODELS", "TEXT_MOCK")}
    try:
        result = callback()
        print(f"{name}: {'ok' if result else 'FAIL'}")
        return result
    except Exception as error:
        print(f"{name}: FAIL ({error})")
        return False
    finally:
        groq_client.chat = original_chat
        backend._generate = original_generate
        backend.MODELS = original_models
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def route_setup(providers="groq", key="test-key"):
    os.environ["TEXT_MOCK"] = "0"
    os.environ["TEXT_PROVIDERS"] = providers
    backend.MODELS = ["fake-gemini"]
    backend._generate = lambda *args: (_ for _ in ()).throw(AssertionError("unexpected Gemini call"))
    if key is None:
        os.environ.pop("GROQ_API_KEY", None)
    else:
        os.environ["GROQ_API_KEY"] = key


def main():
    passed = True

    passed &= run_client_case("models defaults", lambda: groq_client.models_from_env(None) == groq_client.DEFAULT_MODELS)
    passed &= run_client_case("models parsing", lambda: groq_client.models_from_env("a, b ,,c") == ["a", "b", "c"])
    passed &= run_client_case("models capped", lambda: groq_client.models_from_env("a,b,c,d,e") == ["a", "b", "c"])

    def success():
        seen = {}

        def fake(request, timeout):
            seen["request"] = request
            return FakeResponse({"choices": [{"message": {"content": '{"ok": true}'}}]})

        urllib.request.urlopen = fake
        result = groq_client.chat("model-a", "prompt", "test-key")
        body = json.loads(seen["request"].data)
        return (
            result == '{"ok": true}'
            and seen["request"].headers["Authorization"] == "Bearer test-key"
            and seen["request"].headers["User-agent"] == "orb-agent/1.0"
            and body["model"] == "model-a"
            and body["messages"] == [{"role": "user", "content": "prompt"}]
            and "response_format" in body
        )

    passed &= run_client_case("chat success", success)

    def retry_without_json_mode():
        calls = []

        def fake(request, timeout):
            calls.append(json.loads(request.data))
            if len(calls) == 1:
                raise urllib.error.HTTPError(request.full_url, 400, "bad request", {}, io.BytesIO(b"schema"))
            return FakeResponse({"choices": [{"message": {"content": "ok"}}]})

        urllib.request.urlopen = fake
        return groq_client.chat("model-a", "prompt", "test-key") == "ok" and len(calls) == 2 and "response_format" not in calls[1]

    passed &= run_client_case("chat retries without json mode", retry_without_json_mode)

    def status_errors():
        for status in (429, 404, 500):
            def fake(request, timeout, status=status):
                raise urllib.error.HTTPError(request.full_url, status, "failure", {}, io.BytesIO(b"failure"))

            urllib.request.urlopen = fake
            try:
                groq_client.chat("model-a", "prompt", "test-key")
            except groq_client.GroqError as error:
                if error.status != status or (status == 429 and "429" not in str(error)):
                    return False
            else:
                return False
        return True

    passed &= run_client_case("chat HTTP errors", status_errors)

    def transport_and_reply_errors():
        def url_error(request, timeout):
            raise urllib.error.URLError("offline")

        urllib.request.urlopen = url_error
        try:
            groq_client.chat("model-a", "prompt", "test-key")
        except groq_client.GroqError as error:
            if error.status is not None:
                return False
        else:
            return False

        def timeout(request, timeout):
            raise TimeoutError("timed out")

        urllib.request.urlopen = timeout
        try:
            groq_client.chat("model-a", "prompt", "test-key")
        except groq_client.GroqError as error:
            if error.status is not None:
                return False
        else:
            return False

        for payload in ({}, {"choices": []}, {"choices": [{"message": {"content": ""}}]}, b"not json"):
            urllib.request.urlopen = lambda request, timeout, payload=payload: (
                FakeResponse(payload) if isinstance(payload, dict) else type("Response", (), {
                    "__enter__": lambda self: self,
                    "__exit__": lambda self, *args: False,
                    "read": lambda self: payload,
                })()
            )
            try:
                groq_client.chat("model-a", "prompt", "test-key")
            except groq_client.GroqError:
                continue
            return False
        return True

    passed &= run_client_case("chat transport and reply errors", transport_and_reply_errors)

    def key_redacted():
        def fake(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 500, "failure", {}, io.BytesIO(b"SECRET-123"))

        urllib.request.urlopen = fake
        try:
            groq_client.chat("model-a", "prompt", "SECRET-123")
        except groq_client.GroqError as error:
            return "SECRET-123" not in str(error)
        return False

    passed &= run_client_case("chat key redaction", key_redacted)

    def route_success():
        route_setup()
        calls = []
        groq_client.chat = lambda model, prompt, key: (calls.append(model) or valid_reply())
        backend._generate = lambda *args: (_ for _ in ()).throw(AssertionError("Gemini was called"))
        result = backend.text_beats(backend.Question(question="What is a variable?", history=[]))
        return result["kind"] == "text" and result["data"]["beats"] and calls == ["openai/gpt-oss-120b"] and backend._requests_used.get() == 0

    passed &= run_route_case("route Groq success", route_success)

    def route_second_model():
        route_setup()
        os.environ["GROQ_MODELS"] = "first,second"
        calls = []

        def fake(model, prompt, key):
            calls.append(model)
            if model == "first":
                raise groq_client.GroqError(404, "missing")
            return valid_reply()

        groq_client.chat = fake
        result = backend.text_beats(backend.Question(question="What is a variable?", history=[]))
        return result["kind"] == "text" and calls == ["first", "second"] and backend._requests_used.get() == 0

    passed &= run_route_case("route second Groq model", route_second_model)

    def route_garbage():
        route_setup()
        calls = []
        groq_client.chat = lambda model, prompt, key: (calls.append(model) or "garbage")
        try:
            backend.text_beats(backend.Question(question="What is a variable?", history=[]))
        except HTTPException as error:
            return error.status_code == 502 and len(calls) <= 3 and backend._requests_used.get() == 0
        return False

    passed &= run_route_case("route Groq garbage", route_garbage)

    def route_quota():
        route_setup()
        calls = []
        groq_client.chat = lambda model, prompt, key: (calls.append(model) or (_ for _ in ()).throw(groq_client.GroqError(429, "quota")))
        try:
            backend.text_beats(backend.Question(question="What is a variable?", history=[]))
        except HTTPException as error:
            return error.status_code == 429 and len(calls) <= 3 and backend._requests_used.get() == 0
        return False

    passed &= run_route_case("route Groq quota", route_quota)

    def route_gemini_fallback():
        route_setup("groq,gemini")
        groq_client.chat = lambda model, prompt, key: (_ for _ in ()).throw(groq_client.GroqError(429, "quota"))
        calls = []

        def fake_generate(model, prompt, use_schema):
            calls.append(model)
            return type("Response", (), {"text": valid_reply()})()

        backend._generate = fake_generate
        result = backend.text_beats(backend.Question(question="What is a variable?", history=[]))
        return result["kind"] == "text" and calls == [backend.MODELS[0]] and backend._requests_used.get() == 0

    passed &= run_route_case("route Gemini fallback", route_gemini_fallback)

    def route_without_key():
        route_setup("groq", None)
        output = io.StringIO()
        with redirect_stdout(output):
            try:
                backend.text_beats(backend.Question(question="What is a variable?", history=[]))
            except HTTPException as error:
                return (
                    error.status_code == 502
                    and error.detail == "No text provider is configured"
                    and "test-key" not in error.detail
                    and "test-key" not in output.getvalue()
                    and backend._requests_used.get() == 0
                )
        return False

    passed &= run_route_case("route missing Groq key", route_without_key)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
