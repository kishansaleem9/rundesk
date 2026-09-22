# Keep the fourth option in the select and take the colour away again. This is the
# duplicated-list defect restored to exactly how it was found: a value the server
# accepts, the picker offers, and the grid renders identically to 'Nothing'.
#
# REDDENS: planner-appearance-toggles.mjs — "the picker offers `list`, and choosing it repaints the grid"
#          and "two blocks on one list match, and a block on another list does not"
#
# Reddens: planner-appearance-toggles: "and choosing it repaints the grid"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      hue = listHue(b.taskListId)'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = "      hue = 'accent' // BREAK: `list` is accepted and colours nothing"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("made colorTasksBy='list' paint every block the neutral accent")
