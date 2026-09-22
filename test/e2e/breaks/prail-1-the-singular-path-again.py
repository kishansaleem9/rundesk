# The planner asks for its assigned tasks at `/member/` — singular — which is
# not a route the API serves.
#
# The bug as found, and the suite exists because of it. Every load answered
# 404, so `assigned` was permanently `[]`: the Backlog rail was always empty
# and the two Time-blocking switches that gate that list were gating nothing,
# "in the running product, after the commit whose title was about making those
# switches work."
#
# AND IT SURVIVED BECAUSE THE SUITES AGREED WITH THE CLIENT. The file says so:
# `planner-grid.mjs` and `planner-settings.mjs` both stubbed the request by
# matching `'/member/'`, so the stub implemented the typo and the route was
# never asked. That is why this suite records the STATUS of the call it
# watched rather than the contents of a list — a 404 empties every section
# built on it, silently, and an empty section looks like an empty week.
#
# REDDENS FIVE: the status check, and the four checks about what the two new
# sections hold, because a 404 makes both of them empty. The section-existence
# and section-order checks stay green — the headings render either way, which
# is the whole reason a section's CONTENTS have to be checked separately from
# its presence.
#
# Reddens: planner-rail: "and the API answers it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "    queryFn: () => api<TaskRow[]>(`/tasks/workspace/${workspaceId}/members/${currentUserId}`),"
b = "    queryFn: () => api<TaskRow[]>(`/tasks/workspace/${workspaceId}/member/${currentUserId}`),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the assigned-tasks request uses the singular path again.')
