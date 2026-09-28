# The planner stops asking the workspace for its work schedule and asks for something else,
# so the dimming has nothing real to read: no `/work-schedule` request is ever made and the
# columns it shades are decided by an empty answer rather than by the team's working week.
# Reddens: planner-appearance-toggles: "the schedule is already on the page — the Holidays calendar reads it — and not one column "
#   or "exactly the 5 days outside the schedule are dimmed, and they are the right ones"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        `/workspaces/${workspaceId}/work-schedule`,'
b = '        `/workspaces/${workspaceId}/schedule-somewhere-else`,'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the work schedule is never requested.')
