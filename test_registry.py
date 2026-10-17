import json
import re
from pathlib import Path

import registry
from director import VOCAB, compile


def check(name, condition):
    print(f"{name}: {'ok' if condition else 'FAIL'}")
    return condition


def main():
    passed = True
    passed &= check("entry counts", len(registry.keys("layout")) == 6 and len(registry.keys("enter")) == 11 and len(registry.keys("transition")) == 3)
    all_entries = [entry for group in registry.ENTRIES.values() for entry in group.items()]
    passed &= check("entry names and descriptions", all(re.fullmatch(r"[a-z]+", key) and entry["use"] and len(entry["use"]) <= 90 for key, entry in all_entries))
    passed &= check("enter fits", all(entry["fits"] and all(registry.is_valid("layout", layout) for layout in entry["fits"]) for entry in registry.ENTRIES["enter"].values()))
    passed &= check("invalid registry values", not registry.is_valid("layout", None) and not registry.is_valid("layout", 5) and not registry.is_valid("layout", ["x"]) and not registry.is_valid("layout", "wobble") and not registry.is_valid("unknown", "word"))
    passed &= check("fit rules", registry.fits("countup", "stat") and not registry.fits("countup", "stack") and not registry.fits("slam", "split"))
    prompt = registry.prompt_block()
    passed &= check("prompt block", all(key in prompt for key, _ in all_entries) and len(prompt) < 2200)

    text = Path("text-engine.js").read_text(encoding="utf-8")
    missing = [key for kind in ("layout", "enter", "transition") for key in registry.keys(kind) if f'"{key}"' not in text and f"'{key}'" not in text]
    passed &= check(f"frontend registry coverage ({missing})", not missing)

    hinted = compile([{"say": "strong claim", "show": "A bold idea", "role": "claim", "layout": "word", "enter": "slam"}], seed=1)[0]
    passed &= check("valid hints", hinted["layout"] == "word" and hinted["enter"] == "slam")
    unknown = compile([{"say": "claim", "show": "A normal statement", "role": "claim", "layout": 5, "enter": "wobble", "transition": ["x"]}], seed=1)[0]
    passed &= check("unknown hints", unknown["layout"] == "stack" and unknown["transition"] == "fade")
    passed &= check("invalid enter fit", compile([{"say": "claim", "show": "A normal statement", "role": "claim", "enter": "countup"}], seed=1)[0]["enter"] != "countup")
    passed &= check("invalid stat hint", compile([{"say": "x", "show": "no digits here", "layout": "stat"}], seed=1)[0]["layout"] == "stack")
    split = compile([{"say": "x", "show": "Stack vs Queue", "layout": "split"}], seed=1)[0]
    passed &= check("split hint", split["layout"] == "split" and split["lines"] == ["Stack", "Queue"])
    flashes = compile([{"say": "x", "show": "word", "role": "hook", "transition": "flash"} for _ in range(6)], seed=1)
    passed &= check("hinted flash guard", flashes[0]["transition"] == "fade" and all(sum(item["transition"] == "flash" for item in flashes[i:i + 3]) <= 1 for i in range(4)))
    slams = compile([{"say": "x", "show": "word", "layout": "word", "enter": "slam"} for _ in range(5)], seed=1)
    passed &= check("hinted enter guard", all(not (slams[i]["enter"] == slams[i - 1]["enter"] == slams[i - 2]["enter"]) for i in range(2, len(slams))))
    stacks = compile([{"say": "x", "show": "normal statement", "layout": "stack"} for _ in range(8)], seed=1)
    passed &= check("hinted layout guard", all(not (stacks[i]["layout"] == stacks[i - 1]["layout"] == stacks[i - 2]["layout"]) for i in range(2, len(stacks))))
    result = compile(stacks, seed=1)
    passed &= check("output and determinism", all(item["layout"] in VOCAB["layouts"] and item["enter"] in VOCAB["enters"] and item["transition"] in VOCAB["transitions"] for item in result) and bool(json.dumps(result)) and compile(stacks, seed=1) == compile(stacks, seed=1))
    try:
        compile([{"say": "x", "show": "word", "layout": value, "enter": value, "transition": value} for value in (None, 5, [], {})])
        safe = True
    except Exception:
        safe = False
    passed &= check("hint safety", safe)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
