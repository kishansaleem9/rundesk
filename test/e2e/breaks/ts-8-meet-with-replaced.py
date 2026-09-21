# The one-person overlay is dropped, which is the cheapest way to make the rest
# of this suite green and the worst outcome for the product: "is Sara free on
# Thursday" is a different question from "when are the four of us free".
# Reddens: team-schedules: "and "Meet with" still overlays one person on your own week"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '                  {theirBusy\n'
b = '                  {[]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the Meet-with overlay draws nothing.')
