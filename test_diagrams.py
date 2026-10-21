import json

from diagrams import build_chain, build_diagram


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

    def diagram_content(count):
        return {
            "objects": [{"type": "box", "text": f"Object {i}"} for i in range(count)],
            "links": [[i, i + 1] for i in range(count - 1)],
            "steps": [{"say": "Start", "focus": []}, {"say": "Reveal", "focus": [count - 1]}],
        }

    diagram_two = build_diagram(diagram_content(2))
    diagram_four = build_diagram(diagram_content(4))
    diagram_five = build_diagram(diagram_content(5))
    diagram_six = build_diagram(diagram_content(6))
    passed &= check("diagram 2 objects", diagram_two is not None and len(diagram_two["objects"]) == 2)
    passed &= check("diagram 4 objects", diagram_four is not None and len(diagram_four["objects"]) == 4)
    passed &= check("diagram 5 objects", diagram_five is not None and len(diagram_five["objects"]) == 5)
    passed &= check("diagram 6 objects", diagram_six is not None and len(diagram_six["objects"]) == 6)
    passed &= check("diagram 1 object rejected", build_diagram(diagram_content(1)) is None)
    passed &= check("diagram 7 objects rejected", build_diagram(diagram_content(7)) is None)

    unknown_type = build_diagram({
        "objects": [{"type": "triangle", "text": "A"}, {"type": "box", "text": "B"}],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("unknown type defaults to circle", unknown_type is not None and unknown_type["objects"][0]["type"] == "circle")
    passed &= check("empty object text rejected", build_diagram({
        "objects": [{"type": "box", "text": "   "}, {"type": "box", "text": "B"}],
        "steps": [{"say": "A"}, {"say": "B"}],
    }) is None)
    passed &= check("two-row y layout", diagram_five is not None and [obj["y"] for obj in diagram_five["objects"]] == [32, 32, 32, 62, 62])
    passed &= check("diagram x positions in range", diagram_six is not None and all(0 <= obj["x"] <= 100 for obj in diagram_six["objects"]))

    bad_links = build_diagram({
        "objects": [{"text": "A"}, {"text": "B"}, {"text": "C"}],
        "links": [[0, 0], [0, 3], [-1, 1], [0, "1"], [0, 1], [0, 1], [1, 2]],
        "steps": [{"say": "A"}, {"say": "B", "focus": [2]}],
    })
    passed &= check("bad links dropped", bad_links is not None and bad_links["arrows"] == [
        {"id": "a0", "from": "n0", "to": "n1"},
        {"id": "a1", "from": "n1", "to": "n2"},
    ])
    passed &= check("links reveal after both ends", bad_links is not None and bad_links["steps"][0]["show"] == ["n0"] and "a1" in bad_links["steps"][1]["show"])
    passed &= check("diagram fewer valid steps rejected", build_diagram({
        "objects": [{"text": "A"}, {"text": "B"}],
        "steps": [{"say": "   "}, {"say": None}],
    }) is None)

    diagram_junk = [build_diagram(value) for value in (None, 5, "x", [], {}, {"objects": "x"})]
    passed &= check("diagram junk inputs never raise", all(result is None for result in diagram_junk))
    passed &= check("diagram json serializable", diagram_six is not None and bool(json.dumps(diagram_six)))

    def layout_case(layout, count):
        result = build_diagram({
            "layout": layout,
            "objects": [{"text": f"O{i}"} for i in range(count)],
            "steps": [{"say": "Start"}, {"say": "End", "focus": [count - 1]}],
        })
        positions = [(item["x"], item["y"]) for item in result["objects"]]
        return result is not None and all(8 <= x <= 92 and 8 <= y <= 92 for x, y in positions) and len(set(positions)) == count

    passed &= check("row layout", layout_case("row", 3))
    passed &= check("column layout", layout_case("column", 5))
    passed &= check("snake layout", layout_case("snake", 6))
    passed &= check("hub layout", layout_case("hub", 5))
    passed &= check("cycle layout", layout_case("cycle", 5))
    fallback_layout = build_diagram({
        "layout": "unknown",
        "objects": [{"text": "A"}, {"text": "B"}, {"text": "C"}],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("invalid layout fallback", fallback_layout is not None and [item["y"] for item in fallback_layout["objects"]] == [45, 45, 45])
    wrong_count_layout = build_diagram({
        "layout": "hub",
        "objects": [{"text": "A"}, {"text": "B"}],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("wrong layout count fallback", wrong_count_layout is not None and [item["y"] for item in wrong_count_layout["objects"]] == [45, 45])
    snake_six = build_diagram({
        "layout": "snake",
        "objects": [{"text": str(i)} for i in range(6)],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("snake reverse second row", snake_six is not None and snake_six["objects"][3]["x"] == snake_six["objects"][2]["x"] and snake_six["objects"][3]["y"] == 62)
    snake_four = build_diagram({
        "layout": "snake",
        "objects": [{"text": str(i)} for i in range(4)],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    snake_five = build_diagram({
        "layout": "snake",
        "objects": [{"text": str(i)} for i in range(5)],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("snake four alignment", snake_four is not None and [item["x"] for item in snake_four["objects"]] == [15, 85, 85, 15])
    passed &= check("snake five alignment", snake_five is not None and [item["x"] for item in snake_five["objects"]] == [15, 50, 85, 85, 50])
    passed &= check("snake six alignment", snake_six is not None and [item["x"] for item in snake_six["objects"]] == [15, 50, 85, 85, 50, 15])
    cycle = build_diagram({
        "layout": "cycle",
        "objects": [{"text": str(i)} for i in range(4)],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("cycle starts at top", cycle is not None and cycle["objects"][0]["y"] == min(item["y"] for item in cycle["objects"]))
    label_link = build_diagram({
        "objects": [{"type": "label", "text": "Note"}, {"text": "A"}, {"text": "B"}],
        "links": [[0, 1], [1, 2], [2, 0]],
        "steps": [{"say": "A"}, {"say": "B", "focus": [2]}],
    })
    passed &= check("linked label becomes box", label_link is not None and label_link["objects"][0]["type"] == "box" and label_link["arrows"] == [
        {"id": "a0", "from": "n0", "to": "n1"},
        {"id": "a1", "from": "n1", "to": "n2"},
    ])
    unlinked_label = build_diagram({
        "objects": [{"type": "label", "text": "Note"}, {"text": "A"}, {"text": "B"}],
        "links": [[1, 2]],
        "steps": [{"say": "A"}, {"say": "B", "focus": [2]}],
    })
    passed &= check("unlinked label stays label", unlinked_label is not None and unlinked_label["objects"][0]["type"] == "label")
    shortcut_links = build_diagram({
        "layout": "row",
        "objects": [{"text": "A"}, {"text": "B"}, {"text": "C"}],
        "links": [[0, 1], [1, 2], [0, 2]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("row shortcut link dropped", shortcut_links is not None and shortcut_links["arrows"] == [
        {"id": "a0", "from": "n0", "to": "n1"},
        {"id": "a1", "from": "n1", "to": "n2"},
    ])
    only_shortcut = build_diagram({
        "layout": "row",
        "objects": [{"text": "A"}, {"text": "B"}, {"text": "C"}],
        "links": [[0, 2]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("only row shortcut remains valid", only_shortcut is not None and only_shortcut["arrows"] == [])
    cycle_links = build_diagram({
        "layout": "cycle",
        "objects": [{"text": str(i)} for i in range(4)],
        "links": [[0, 1], [1, 2], [2, 3], [3, 0]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("cycle links stay", cycle_links is not None and len(cycle_links["arrows"]) == 4)
    snake_links = build_diagram({
        "layout": "snake",
        "objects": [{"text": str(i)} for i in range(5)],
        "links": [[0, 1], [1, 2], [2, 3], [3, 4]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("snake sequential links stay", snake_links is not None and len(snake_links["arrows"]) == 4)
    passed &= check("arrow ids contiguous", snake_links is not None and [arrow["id"] for arrow in snake_links["arrows"]] == ["a0", "a1", "a2", "a3"])
    snake_diagonal = build_diagram({
        "layout": "snake",
        "objects": [{"text": str(i)} for i in range(5)],
        "links": [[0, 1], [1, 2], [2, 3], [3, 4], [0, 4]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("snake diagonal dropped", snake_diagonal is not None and len(snake_diagonal["arrows"]) == 4 and
                    {"from": "n0", "to": "n4"} not in [{key: arrow[key] for key in ("from", "to")} for arrow in snake_diagonal["arrows"]])
    snake_vertical = build_diagram({
        "layout": "snake",
        "objects": [{"text": str(i)} for i in range(5)],
        "links": [[2, 3]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("snake vertical link stays", snake_vertical is not None and snake_vertical["arrows"] == [{"id": "a0", "from": "n2", "to": "n3"}])
    hub_links = build_diagram({
        "layout": "hub",
        "objects": [{"text": str(i)} for i in range(4)],
        "links": [[0, 1], [0, 2], [0, 3]],
        "steps": [{"say": "A"}, {"say": "B"}],
    })
    passed &= check("hub links stay", hub_links is not None and len(hub_links["arrows"]) == 3)
    eight_steps = build_diagram({
        "objects": [{"text": "A"}, {"text": "B"}],
        "steps": [{"say": f"Step {i}"} for i in range(8)],
    })
    passed &= check("diagram keeps eight steps", eight_steps is not None and len(eight_steps["steps"]) == 8)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
