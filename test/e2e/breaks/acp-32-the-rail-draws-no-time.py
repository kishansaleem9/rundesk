# THE PLANNER RAIL SAYS WHO ADDED A PRIORITY, AND WHEN ONLY ON HOVER.
#
# `found-29-sep/priority-added-at-on-hover-only`. The panel still draws the
# time, so whoever checks a colleague's panel sees it right. The owner's own
# rail, where they decide their day, is the one that loses it.
#
# ONE CHECK: the rail's time, read drawn.
#
# Reddens: assign-to-priorities: "and when, drawn in the rail as well"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "                              {relativeTime(p.createdAt, locale)}\n"
b = "                              {''}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-32-the-rail-draws-no-time: the time is left to the hover title')
