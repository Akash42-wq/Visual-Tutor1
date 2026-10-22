import registry
from lesson import build_lesson_prompt

p = build_lesson_prompt("x" * 5000)
print("lesson prompt length:", len(p))
print("registry block length:", len(registry.prompt_block()))
print("registry block inside lesson prompt:", registry.prompt_block()[:40] in p)