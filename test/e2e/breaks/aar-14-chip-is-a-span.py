# The path chip goes back to being a `<span>`: a path that looks like a link, cannot
# be pressed, cannot be middle-clicked and does not exist to a keyboard — in the one
# sentence that is telling you to go there. The dead control, `18:48`.
# Reddens: ai-answer-rendering: "the list chip is a link to that list's real route, space and project included"
#          ai-answer-rendering: "each opening its OWN tab of that list — two chips, two different links" / "and pressing one opens that view of that list"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "    if (!href) {"
b = "    if (true) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: every list and view chip renders as an inert span again.')
