from backend import Turn, format_history


empty = format_history([])
assert empty == ""
print("no turns: ok")

two = format_history([
    Turn(user="What is x?", gist="x is a variable."),
    Turn(user="And y?", gist="y is another variable."),
])
assert "Student: What is x?" in two
assert "Tutor said: y is another variable." in two
print("2 turns: ok")

ten = format_history([
    Turn(user=f"question {index}", gist=f"gist {index}")
    for index in range(10)
])
assert "question 3" not in ten
assert "question 4" in ten
assert "question 9" in ten
print("10 turns, last 6 only: ok")

long_user = "a" * 1000 + "\nsecond line"
long = format_history([Turn(user=long_user, gist="first\nsecond")])
assert len(long_user[:200]) == 200
assert "a" * 200 in long
assert "a" * 201 not in long
assert "first second" in long
assert "\nsecond line" not in long
print("slicing and newline collapsing: ok")
