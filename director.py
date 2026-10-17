import math
import random
import re

from registry import fits, is_valid, keys


VOCAB = {
    "layouts": keys("layout"),
    "enters": keys("enter"),
    "exits": ["cut", "fade"],
    "transitions": keys("transition"),
    "bgs": ["black", "palette"],
}
MAX_BEATS = 12
MAX_WORDS = 8
MAX_CHARS = 48

_ROLES = {"hook", "claim", "term", "contrast", "number", "example", "conclusion"}
_WORD_RE = re.compile(r"\S+")
_NUMBER_RE = re.compile(r"\d[\d,\.]*\s?(?:%|x|k|m|b)?", re.IGNORECASE)


def _text(value):
    try:
        return re.sub(r"\s+", " ", str(value)).strip()
    except Exception:
        return ""


def _trim_words(value, limit=MAX_WORDS):
    words = value.split()
    result = []
    for word in words[:limit]:
        candidate = " ".join(result + [word])
        if len(candidate) > MAX_CHARS:
            break
        result.append(word)
    return " ".join(result)


def _plain_words(value):
    return re.findall(r"[^\W_]+", value.lower(), re.UNICODE)


def _emphasis(show, raw, role):
    show_words = _WORD_RE.findall(show)
    normalized = [_plain_words(word) for word in show_words]
    try:
        candidates = raw if isinstance(raw, list) else []
        for item in candidates:
            if not isinstance(item, str):
                continue
            wanted = _plain_words(item)
            if not wanted:
                continue
            for index, words in enumerate(normalized):
                if words == wanted:
                    return [show_words[index]]
        if role in {"hook", "claim", "term"}:
            eligible = [word for word in show_words if len(_plain_words(word)) == 1 and len(_plain_words(word)[0]) >= 5]
            if eligible:
                return [max(eligible, key=lambda word: len(_plain_words(word)[0]))]
    except Exception:
        return []
    return []


def _claim_lines(text):
    words = text.split()
    if len(words) < 4:
        return [text]
    middle = len(words) / 2
    split_at = min(range(1, len(words)), key=lambda index: abs(index - middle))
    return [" ".join(words[:split_at]), " ".join(words[split_at:])]


def _split_first(text, separators):
    matches = []
    for separator in separators:
        match = re.search(re.escape(separator), text, re.IGNORECASE)
        if match:
            matches.append((match.start(), match.end()))
    if not matches:
        return None
    start, end = min(matches)
    left = text[:start].strip()
    right = text[end:].strip()
    return [left, right] if left and right else None


def _layout(role, text):
    if role in {"hook", "conclusion"}:
        return "word", [text]
    if role == "claim":
        return "stack", _claim_lines(text)
    if role == "term":
        lines = _split_first(text, [":", " - ", " — "])
        return ("term", lines) if lines else ("word", [text])
    if role == "contrast":
        lines = _split_first(text, [" vs. ", " vs ", " | ", " / "])
        return ("split", lines) if lines else ("stack", _claim_lines(text))
    if role == "number":
        match = _NUMBER_RE.search(text)
        if match:
            token = match.group(0).strip()
            remaining = (text[:match.start()] + " " + text[match.end():]).strip()
            return "stat", [token, re.sub(r"\s+", " ", remaining)]
        return "stack", _claim_lines(text)
    if role == "example":
        parts = [part.strip() for part in re.split(r"[|;]", text) if part.strip()][:4]
        return ("lines", parts) if len(parts) > 1 else ("stack", _claim_lines(text))
    return "word", [text]


def _hinted_layout(text, hint):
    if hint == "word":
        return "word", [text]
    if hint == "stack":
        return "stack", _claim_lines(text)
    if hint == "term":
        lines = _split_first(text, [":", " - ", " — "])
        return ("term", lines) if lines else None
    if hint == "split":
        lines = _split_first(text, [" vs. ", " vs ", " | ", " / "])
        return ("split", lines) if lines else None
    if hint == "stat":
        match = _NUMBER_RE.search(text)
        if match:
            token = match.group(0).strip()
            remaining = (text[:match.start()] + " " + text[match.end():]).strip()
            return "stat", [token, re.sub(r"\s+", " ", remaining)]
        return None
    if hint == "lines":
        parts = [part.strip() for part in re.split(r"[|;]", text) if part.strip()][:4]
        return ("lines", parts) if len(parts) > 1 else None
    return None


def _enter_pool(role, layout):
    if role == "hook":
        return ["slam", "punch", "drop"]
    if role == "term":
        return ["blur", "rise", "scale"]
    if layout == "split":
        return ["slide"]
    if layout == "stat":
        return ["countup"]
    if layout == "lines":
        return ["lines"]
    if role == "conclusion":
        return ["fade", "blur"]
    if layout == "stack" or role == "claim":
        return ["rise", "words", "blur"]
    return ["punch", "rise"]


def _safe_int(value):
    try:
        return int(value)
    except Exception:
        return 1000


def compile(beats, seed=None) -> list[dict]:
    try:
        rng = random.Random(seed)
    except Exception:
        rng = random.Random()
    try:
        if not isinstance(beats, list):
            return []
        decided = []
        previous_enter = None
        for raw in beats:
            if not isinstance(raw, dict):
                continue
            say = _text(raw.get("say", ""))[:240]
            show = _text(raw.get("show", ""))
            role = raw.get("role", "claim")
            role = role if isinstance(role, str) and role in _ROLES else "claim"
            if not show:
                show = " ".join(say.split()[:5])
            show = _trim_words(show)
            if not say and not show:
                continue
            if not show:
                continue
            emphasis = _emphasis(show, raw.get("emphasis", []), role)
            layout_hint = raw.get("layout")
            if is_valid("layout", layout_hint):
                hinted = _hinted_layout(show, layout_hint)
                if hinted:
                    layout, lines = hinted
                elif len(show.split()) == 1:
                    layout, lines = "word", [show]
                else:
                    layout, lines = "stack", _claim_lines(show)
            else:
                layout, lines = _layout(role, show)
            if len(decided) >= 2 and decided[-1]["layout"] == layout and decided[-2]["layout"] == layout:
                layout, lines = "word", [show]
            speech = len(say.split()) * 380
            reading = 600 + len(show.split()) * 300
            ms = max(1000, min(8000, max(speech, reading)))
            pool = _enter_pool(role, layout)
            enter_hint = raw.get("enter")
            if is_valid("enter", enter_hint) and fits(enter_hint, layout):
                recent_enters = [item["enter"] for item in decided[-2:]]
                enter = enter_hint if recent_enters != [enter_hint, enter_hint] else None
            else:
                enter = None
            if enter is None:
                choices = [entry for entry in pool if entry != previous_enter] or pool
                enter = rng.choice(choices)
            previous_enter = enter
            exit_name = "fade" if ms >= 1500 and role != "hook" else "cut"
            if not decided:
                transition = "fade"
            elif is_valid("transition", raw.get("transition")):
                transition = raw["transition"]
                if transition == "flash" and sum(item["transition"] == "flash" for item in decided[-2:]) >= 1:
                    transition = "cut"
            elif role == "conclusion":
                transition = "fade"
            elif role in {"hook", "number"}:
                recent_flashes = sum(item["transition"] == "flash" for item in decided[-2:])
                transition = "flash" if recent_flashes == 0 else "cut"
            else:
                transition = "cut"
            bg = "black" if role in {"hook", "number", "contrast", "example"} else "palette"
            decided.append({
                "say": say,
                "text": show,
                "lines": lines,
                "role": role,
                "layout": layout,
                "emphasis": emphasis,
                "enter": enter,
                "exit": exit_name,
                "ms": _safe_int(ms),
                "transition": transition,
                "bg": bg,
            })
        if len(decided) > MAX_BEATS:
            decided = decided[:MAX_BEATS - 1] + [decided[-1]]
        if decided:
            decided[-1]["exit"] = "fade"
        return decided
    except Exception:
        return []
