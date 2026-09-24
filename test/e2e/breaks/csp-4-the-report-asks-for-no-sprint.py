# THE REPORT ASKS FOR THE PERIOD ALONE: the picker changes, the report stays on the default sprint.
# Reddens: contribution-sprint: "the Sprint period offers a sprint to choose — the one begun last by default — and reports on the one chosen"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-insights-page.tsx'
a = "        `/workspaces/${workspaceId}/reports/contribution?period=${contribPeriod}${chosenSprintId ? `&sprintId=${chosenSprintId}` : ''}`,\n"
b = '        `/workspaces/${workspaceId}/reports/contribution?period=${contribPeriod}`,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("csp-4-the-report-asks-for-no-sprint: applied")
