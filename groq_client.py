import json
import urllib.error
import urllib.request


URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODELS = [
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]


class GroqError(Exception):
    def __init__(self, status, message):
        self.status = status if isinstance(status, int) else None
        self.message = _redact(message)
        super().__init__(self.message)

    def __str__(self):
        return f"{self.status} {self.message}"


def _redact(message, api_key=None):
    text = str(message)
    if api_key:
        text = text.replace(api_key, "***")
    return text[:300]


def models_from_env(value) -> list[str]:
    if not value:
        return DEFAULT_MODELS.copy()
    models = [model.strip() for model in value.split(",") if model.strip()]
    return models[:3] or DEFAULT_MODELS.copy()


def _chat_once(model, prompt, api_key, timeout, json_mode, reasoning=True):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 2000,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if reasoning and model.startswith("openai/gpt-oss"):
        payload["reasoning_effort"] = "low"
    request = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "orb-agent/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
        parsed = json.loads(raw)
        content = parsed["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content:
            raise GroqError(None, "empty reply")
        return content
    except urllib.error.HTTPError as error:
        try:
            body = error.read().decode("utf-8", "replace")
        except Exception:
            body = str(error)
        raise GroqError(error.code, _redact(body, api_key)) from error
    except GroqError:
        raise
    except urllib.error.URLError as error:
        raise GroqError(None, _redact(error.reason, api_key)) from error
    except TimeoutError as error:
        raise GroqError(None, _redact(error, api_key)) from error
    except Exception as error:
        raise GroqError(None, _redact(error, api_key)) from error


def chat(model, prompt, api_key, timeout=12, json_mode=True) -> str:
    try:
        return _chat_once(model, prompt, api_key, timeout, json_mode)
    except GroqError as error:
        if error.status == 400 and json_mode:
            return _chat_once(model, prompt, api_key, timeout, False, reasoning=False)
        raise
