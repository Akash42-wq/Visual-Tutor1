import re


def build_chain(content) -> dict | None:
    try:
        if not isinstance(content, dict):
            return None
        raw_nodes = content.get("nodes")
        if not isinstance(raw_nodes, list) or not 3 <= len(raw_nodes) <= 5:
            return None
        nodes = []
        for raw_node in raw_nodes:
            label = re.sub(r"\s+", " ", str(raw_node)).strip()[:12]
            if not label:
                return None
            nodes.append(label)

        shape = content.get("shape")
        if shape not in ("circle", "box"):
            shape = "circle"

        raw_steps = content.get("steps")
        if not isinstance(raw_steps, list):
            return None
        steps = []
        for raw_step in raw_steps[:6]:
            if not isinstance(raw_step, dict):
                continue
            say = raw_step.get("say")
            if not isinstance(say, str) or not say.strip():
                continue
            focus = raw_step.get("focus")
            if not isinstance(focus, list):
                focus = []
            clean_focus = []
            for index in focus:
                if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(nodes) and index not in clean_focus:
                    clean_focus.append(index)
            steps.append({"say": say[:160], "focus": clean_focus})
        if len(steps) < 2:
            return None

        objects = [
            {
                "id": f"n{i}",
                "type": shape,
                "x": 15 + i * (70 / (len(nodes) - 1)),
                "y": 45,
                "text": label,
            }
            for i, label in enumerate(nodes)
        ]
        arrows = [
            {"id": f"a{i}", "from": f"n{i}", "to": f"n{i + 1}"}
            for i in range(len(nodes) - 1)
        ]
        output_steps = []
        revealed = -1
        for step in steps:
            if step["focus"]:
                revealed = max(revealed, max(step["focus"]))
            if revealed == -1:
                revealed = 0
            show = [f"n{i}" for i in range(revealed + 1)]
            show.extend(f"a{i}" for i in range(revealed))
            output_steps.append({
                "say": step["say"][:160],
                "show": show,
                "highlight": [f"n{i}" for i in step["focus"]],
            })
        return {"objects": objects, "arrows": arrows, "steps": output_steps}
    except Exception:
        return None
