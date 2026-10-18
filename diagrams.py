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


def build_diagram(content) -> dict | None:
    try:
        if not isinstance(content, dict):
            return None
        raw_objects = content.get("objects")
        if not isinstance(raw_objects, list) or not 2 <= len(raw_objects) <= 6:
            return None

        objects = []
        for raw_object in raw_objects:
            if not isinstance(raw_object, dict):
                return None
            text = raw_object.get("text")
            if not isinstance(text, str):
                return None
            text = re.sub(r"\s+", " ", text).strip()[:14]
            if not text:
                return None
            object_type = raw_object.get("type")
            if object_type not in ("circle", "box", "label"):
                object_type = "circle"
            objects.append({"type": object_type, "text": text})

        n = len(objects)
        if n <= 4:
            positions = [(15 + i * (70 / (n - 1)), 45) for i in range(n)]
        else:
            first_count = (n + 1) // 2
            positions = []
            for i in range(first_count):
                x = 50 if first_count == 1 else 15 + i * (70 / (first_count - 1))
                positions.append((x, 32))
            second_count = n - first_count
            for i in range(second_count):
                x = 50 if second_count == 1 else 15 + i * (70 / (second_count - 1))
                positions.append((x, 62))
        output_objects = [
            {"id": f"n{i}", "type": item["type"], "text": item["text"], "x": positions[i][0], "y": positions[i][1]}
            for i, item in enumerate(objects)
        ]

        raw_links = content.get("links")
        if not isinstance(raw_links, list):
            raw_links = []
        links = []
        for raw_link in raw_links:
            if (
                not isinstance(raw_link, list)
                or len(raw_link) != 2
                or not all(isinstance(index, int) and not isinstance(index, bool) for index in raw_link)
            ):
                continue
            start, end = raw_link
            if start == end or not 0 <= start < n or not 0 <= end < n or (start, end) in links:
                continue
            links.append((start, end))
            if len(links) == 8:
                break
        arrows = [{"id": f"a{i}", "from": f"n{start}", "to": f"n{end}"} for i, (start, end) in enumerate(links)]

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
                if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < n and index not in clean_focus:
                    clean_focus.append(index)
            steps.append({"say": say[:160], "focus": clean_focus})
        if len(steps) < 2:
            return None

        output_steps = []
        revealed = -1
        for step in steps:
            if step["focus"]:
                revealed = max(revealed, max(step["focus"]))
            if revealed == -1:
                revealed = 0
            show = [f"n{i}" for i in range(revealed + 1)]
            show.extend(
                arrow["id"]
                for arrow, (start, end) in zip(arrows, links)
                if start <= revealed and end <= revealed
            )
            output_steps.append({
                "say": step["say"][:160],
                "show": show,
                "highlight": [f"n{i}" for i in step["focus"]],
            })
        return {"objects": output_objects, "arrows": arrows, "steps": output_steps}
    except Exception:
        return None
