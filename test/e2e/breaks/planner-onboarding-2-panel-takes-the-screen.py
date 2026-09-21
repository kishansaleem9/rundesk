# The onboarding panel becomes a full-screen takeover, the way ClickUp's does. Rundesk's
# planner works with no calendar connected - time blocks, priorities, the backlog - so
# hiding it behind a connect screen removes a working feature in order to advertise a
# different one. Frames `12:40`-`12:50`, and the recorded decision check 10 exists to hold.
# Reddens: planner-onboarding: "the panel sits above the grid (...) and the calendar still draws"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '      className="border-b border-border/60 bg-muted/20 px-5 py-4"'
b = '      className="fixed inset-0 z-50 border-b border-border/60 bg-background px-5 py-4"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the onboarding panel now covers the whole planner.')
