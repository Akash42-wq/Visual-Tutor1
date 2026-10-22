ENTRIES = {
    "layout": {
        "word": {"kind": "layout", "use": "one big phrase alone; hooks, punchlines, conclusions"},
        "stack": {"kind": "layout", "use": "two short lines of text; a normal statement"},
        "term": {"kind": "layout", "use": "a new term then its meaning, written 'Term: meaning'"},
        "split": {"kind": "layout", "use": "two things compared, written 'A vs B'"},
        "stat": {"kind": "layout", "use": "one number and what it measures, like '40% faster'"},
        "lines": {"kind": "layout", "use": "a short list of up to 4 items, written 'a | b | c'"},
    },
    "enter": {
        "slam": {"kind": "enter", "use": "huge sudden impact; opening shock, 1-3 words", "fits": ["word"]},
        "punch": {"kind": "enter", "use": "quick confident pop; strong short claim", "fits": ["word", "stack"]},
        "drop": {"kind": "enter", "use": "falls in from above; a surprising or heavy word", "fits": ["word"]},
        "rise": {"kind": "enter", "use": "gentle upward reveal; calm explanation", "fits": ["stack", "word", "term"]},
        "words": {"kind": "enter", "use": "words appear one by one; a sentence to read in rhythm", "fits": ["stack", "word"]},
        "blur": {"kind": "enter", "use": "comes into focus; abstract, dreamy or thoughtful idea", "fits": ["word", "stack", "term"]},
        "scale": {"kind": "enter", "use": "grows from small; something expanding or important", "fits": ["word", "term"]},
        "fade": {"kind": "enter", "use": "plain soft fade; endings and quiet moments", "fits": ["word", "stack", "term"]},
        "slide": {"kind": "enter", "use": "two sides slide in from opposite edges", "fits": ["split"]},
        "countup": {"kind": "enter", "use": "number counts up from zero", "fits": ["stat"]},
        "lines": {"kind": "enter", "use": "items appear one after another", "fits": ["lines"]},
        "wipe": {"kind": "enter", "use": "text revealed left to right; calm explanations", "fits": ["stack", "word", "term"]},
        "flip": {"kind": "enter", "use": "flips in like a card", "fits": ["word", "stack", "term"]},
        "swing": {"kind": "enter", "use": "swings in from the side", "fits": ["word", "stack"]},
        "glitch": {"kind": "enter", "use": "brief digital jitter then settles; surprising or technical ideas", "fits": ["word", "stack"]},
        "bounce": {"kind": "enter", "use": "springy pop; friendly or playful", "fits": ["word", "stack", "term"]},
        "drift": {"kind": "enter", "use": "slow gentle push-in while visible; quiet or abstract ideas", "fits": ["word", "stack", "term"]},
    },
    "transition": {
        "cut": {"kind": "transition", "use": "instant hard cut; the default"},
        "flash": {"kind": "transition", "use": "white flash; a big reveal, use rarely"},
        "fade": {"kind": "transition", "use": "crossfade; mood change or ending"},
    },
}


def keys(kind):
    return list(ENTRIES.get(kind, {}))


def is_valid(kind, key):
    return isinstance(key, str) and key in ENTRIES.get(kind, {})


def fits(enter, layout):
    return is_valid("enter", enter) and is_valid("layout", layout) and layout in ENTRIES["enter"][enter]["fits"]


def prompt_block():
    sections = [
        ("LAYOUT (optional field 'layout'):", "layout"),
        ("ENTER (optional field 'enter'):", "enter"),
        ("TRANSITION (optional field 'transition'):", "transition"),
    ]
    lines = []
    for heading, kind in sections:
        lines.append(heading)
        for key, entry in ENTRIES[kind].items():
            suffix = f" [layouts: {', '.join(entry['fits'])}]" if kind == "enter" else ""
            lines.append(f"- {key}: {entry['use']}{suffix}")
    return "\n".join(lines)
