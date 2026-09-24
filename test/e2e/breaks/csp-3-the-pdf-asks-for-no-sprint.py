# DOWNLOAD PDF ASKS FOR THE PERIOD ALONE AGAIN: the server's default sprint, whichever was chosen.
# Reddens: contribution-sprint: "Download PDF asks for the sprint chosen"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-insights-page.tsx'
a = '        { period: contribPeriod, ...(chosenSprintId ? { sprintId: chosenSprintId } : {}) },\n'
b = '        { period: contribPeriod },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("csp-3-the-pdf-asks-for-no-sprint: applied")
