# The planner stops asking the workspace for its work schedule and asks for something else,
# so the dimming has nothing real to read: no `/work-schedule` request is ever made and the
# columns it shades are decided by an empty answer rather than by the team's working week.
# Reddens: planner-appearance-toggles: "the schedule is already on the page ..." (no request)
#          and "exactly the N days outside the schedule are dimmed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        `/workspaces/${workspaceId}/work-schedule`,'
b = '        `/workspaces/${workspaceId}/schedule-somewhere-else`,'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the work schedule is never requested.')
