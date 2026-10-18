import json

from diagrams import build_chain


def check(name, condition):
    print(f"{name}: {'ok' if condition else 'FAIL'}")
    return condition


def main():
    passed = True

    valid = build_chain({
        "diagram": "chain",
        "shape": "box",
        "nodes": ["One", "Two", "Three"],
        "steps": [
            {"say": "Start", "focus": []},
            {"say": "Finish", "focus": [2]},
        ],
    })
    passed &= check("valid 3-node case", valid is not None and len(valid["objects"]) == 3 and len(valid["arrows"]) == 2)

    five = build_chain({
        "nodes": ["One", "Two", "Three", "Four", "Five"],
        "steps": [{"say": "First"}, {"say": "Next"}],
    })
    passed &= check("five nodes", five is not None and len(five["objects"]) == 5 and len(five["arrows"]) == 4)
    passed &= check("two nodes rejected", build_chain({"nodes": ["One", "Two"], "steps": [{"say": "a"}, {"say": "b"}]}) is None)
    passed &= check("six nodes rejected", build_chain({"nodes": ["1", "2", "3", "4", "5", "6"], "steps": [{"say": "a"}, {"say": "b"}]}) is None)

    labels = build_chain({
        "nodes": ["  a   label with many words  ", "B", "C"],
        "steps": [{"say": "a"}, {"say": "b"}],
    })
    passed &= check("label truncation", labels is not None and labels["objects"][0]["text"] == "a label with")
    passed &= check("bad shape defaults to circle", labels is not None and labels["objects"][0]["type"] == "circle")

    focused = build_chain({
        "nodes": ["A", "B", "C"],
        "steps": [{"say": "a", "focus": [2, 2, -1, 3, 1]}, {"say": "b", "focus": ["0", 0]}],
    })
    passed &= check("bad focus indexes dropped", focused is not None and focused[ "steps"][0]["highlight"] == ["n2", "n1"] and focused["steps"][1]["highlight"] == ["n0"])

    dropped = build_chain({
        "nodes": ["A", "B", "C"],
        "steps": [{"say": ""}, {"say": None}, {"say": "kept"}, {"say": "also kept"}],
    })
    passed &= check("steps without say dropped", dropped is not None and [step["say"] for step in dropped["steps"]] == ["kept", "also kept"])
    passed &= check("fewer than 2 steps rejected", build_chain({"nodes": ["A", "B", "C"], "steps": [{"say": "only"}]}) is None)

    cumulative = build_chain({
        "nodes": ["A", "B", "C", "D"],
        "steps": [{"say": "first"}, {"say": "later", "focus": [2]}],
    })
    passed &= check("cumulative reveal", cumulative is not None and cumulative["steps"][0]["show"] == ["n0"] and cumulative["steps"][1]["show"] == ["n0", "n1", "n2", "a0", "a1"])
    passed &= check("x positions in range", cumulative is not None and all(0 <= obj["x"] <= 100 for obj in cumulative["objects"]))

    junk_results = [build_chain(value) for value in (None, 5, "x", [], {}, {"nodes": "abc"})]
    passed &= check("junk inputs never raise", all(result is None for result in junk_results))
    passed &= check("json serializable", valid is not None and bool(json.dumps(valid)))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
