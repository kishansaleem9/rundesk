# Read the setting and then do nothing with it. The branch is still there and still
# returns early for people who have it off, so a check that only asserted 'the planner
# opened somewhere sensible' would still pass.
#
# Reddens: planner-appearance-toggles: "with it on the planner opens on the start of the week"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    setAnchor((current) => startOfWeek(current, weekStartsOn))'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '    void weekStartsOn // BREAK: the setting is read and the anchor is left alone'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('removed the anchor move behind alwaysOpenAtStartOfWeek')
