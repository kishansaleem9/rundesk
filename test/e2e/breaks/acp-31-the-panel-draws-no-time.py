# THE PERSON PANEL SAYS WHO ADDED A PRIORITY, AND WHEN ONLY ON HOVER.
#
# `found-29-sep/priority-added-at-on-hover-only`. The time stays in the `title`
# and nothing is drawn, which is what the panel did before. ClickUp's expanded
# Priorities draws "Added at" beside "Added by", and a touch screen shows no
# hover at all.
#
# ONE CHECK: the panel's time, read drawn.
#
# Reddens: assign-to-priorities: "and when it was added, drawn beside who rather than left to a hover"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
a = "                      {relativeTime(p.createdAt, locale)}\n"
b = "                      {''}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-31-the-panel-draws-no-time: the time is left to the hover title')
