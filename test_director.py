import json
import registry

from director import VOCAB, compile


def check(name, condition):
    print(f"{name}: {'ok' if condition else 'FAIL'}")
    return condition


def main():
    passed = True
    passed &= check("empty input", compile([]) == [])
    passed &= check("none input", compile(None) == [])
    passed &= check("string input", compile("x") == [])
    passed &= check("number input", compile(5) == [])
    garbage = compile([None, 5, "x", {}])
    passed &= check("garbage items", garbage == [])

    beats = [{"say": f"Beat {i}", "show": f"Value {i}", "role": "claim", "emphasis": []} for i in range(15)]
    result = compile(beats, seed=1)
    passed &= check("maximum beats", len(result) <= 12 and result[-1]["say"] == "Beat 14")

    long_show = compile([{"say": "long", "show": "one two three four five six seven eight nine ten eleven twelve", "role": "claim"}], seed=1)[0]
    passed &= check("show word cap", len(long_show["text"].split()) <= 8)
    unknown = compile([{"say": "x", "show": "Thing", "role": "unknown"}], seed=1)[0]
    passed &= check("unknown role", unknown["role"] == "claim")

    term = compile([{"say": "term", "show": "Array: a numbered list", "role": "term"}], seed=1)[0]
    passed &= check("term layout", term["layout"] == "term" and term["lines"] == ["Array", "a numbered list"])
    contrast = compile([{"say": "contrast", "show": "Stack vs Queue", "role": "contrast"}], seed=1)[0]
    passed &= check("contrast layout", contrast["layout"] == "split" and len(contrast["lines"]) == 2)
    contrast_fallback = compile([{"say": "contrast", "show": "Stack Queue", "role": "contrast"}], seed=1)[0]
    passed &= check("contrast fallback", contrast_fallback["layout"] == "stack")
    number = compile([{"say": "number", "show": "40% faster", "role": "number"}], seed=1)[0]
    passed &= check("number layout", number["layout"] == "stat" and number["lines"] == ["40%", "faster"])
    number_fallback = compile([{"say": "number", "show": "faster", "role": "number"}], seed=1)[0]
    passed &= check("number fallback", number_fallback["layout"] == "stack")
    example = compile([{"say": "example", "show": "a | b | c", "role": "example"}], seed=1)[0]
    passed &= check("example layout", example["layout"] == "lines" and len(example["lines"]) == 3)

    one = compile([{"say": "one two", "show": "one two", "role": "claim"}], seed=1)[0]
    passed &= check("timing bounds", 1000 <= one["ms"] <= 8000)
    hooks = compile([{"say": "hook", "show": "strong hook", "role": "hook"} for _ in range(5)], seed=1)
    passed &= check("hook enter variety", all(a["enter"] != b["enter"] for a, b in zip(hooks, hooks[1:])))
    claims = compile([{"say": "claim", "show": "same words", "role": "claim"} for _ in range(8)], seed=1)
    passed &= check("layout variety", all(not (claims[i]["layout"] == claims[i - 1]["layout"] == claims[i - 2]["layout"]) for i in range(2, len(claims))))
    emphasis = compile([{"say": "focus", "show": "visible value", "role": "claim", "emphasis": ["missing", "visible"]}], seed=1)[0]
    passed &= check("emphasis", emphasis["emphasis"] == ["visible"] and len(emphasis["emphasis"]) <= 1)
    flashes = compile([{"say": "hook", "show": "strong hook", "role": "hook"} for _ in range(8)], seed=1)
    passed &= check("flash guard", all(sum(item["transition"] == "flash" for item in flashes[i:i + 3]) <= 1 for i in range(6)))
    passed &= check("last exit", result[-1]["exit"] == "fade")
    passed &= check("first transition", result[0]["transition"] == "fade")
    passed &= check("vocabulary", all(
        item["layout"] in VOCAB["layouts"]
        and item["enter"] in VOCAB["enters"]
        and item["exit"] in VOCAB["exits"]
        and item["transition"] in VOCAB["transitions"]
        and item["bg"] in VOCAB["bgs"]
        for item in result
    ))
    passed &= check("json serializable", bool(json.dumps(result)))
    passed &= check("seeded deterministic", compile(beats, seed=7) == compile(beats, seed=7))

    reach_beats = [
        {"say": "hook beat", "show": "Hook", "role": "hook"},
        {"say": "claim beat", "show": "Claim text here", "role": "claim"},
        {"say": "term beat", "show": "Concept: meaning", "role": "term"},
        {"say": "contrast beat", "show": "Left vs Right", "role": "contrast"},
        {"say": "number beat", "show": "50% increase", "role": "number"},
        {"say": "example beat", "show": "alpha | beta | gamma", "role": "example"},
        {"say": "conclusion beat", "show": "Final wrap up", "role": "conclusion"},
    ]
    seen_enters = set()
    for s in range(200):
        for item in compile(reach_beats, seed=s):
            seen_enters.add(item["enter"])
    passed &= check("all 17 enters reachable", len(seen_enters) == 17 and seen_enters == set(registry.keys("enter")))

    variety_beats = [
        {"say": f"Beat {i} explaining a point clearly", "show": f"Point {i}", "role": role}
        for i, role in enumerate(["hook", "claim", "claim", "term", "claim", "claim", "claim", "conclusion"])
    ]
    no_back_to_back = True
    max_two_in_five = True
    valid_fits = True
    for s in range(200):
        res = compile(variety_beats, seed=s)
        if any(a["enter"] == b["enter"] for a, b in zip(res, res[1:])):
            no_back_to_back = False
        for i in range(len(res) - 4):
            window = [b["enter"] for b in res[i:i + 5]]
            if any(window.count(e) > 2 for e in set(window)):
                max_two_in_five = False
        if any(not registry.fits(b["enter"], b["layout"]) for b in res):
            valid_fits = False

    passed &= check("no enter repeats back to back", no_back_to_back)
    passed &= check("no enter more than twice in window of 5", max_two_in_five)
    passed &= check("every enter valid for layout", valid_fits)
    passed &= check("deterministic for fixed seed", compile(variety_beats, seed=42) == compile(variety_beats, seed=42))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
