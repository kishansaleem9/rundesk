# Checks 20/21 — AN EXPORT THAT DUMPS INSTEAD OF EXPORTING THE VIEW.
# Every dated task in the workspace goes into the file, including the project
# the filter is excluding and every other run's rows. It looks like more data,
# which is exactly why nobody notices.
#
# Reddens: gantt-controls: "and nothing from the project the filter excluded"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    for (const g of visibleGroups) {"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    for (const g of [{ title: '', rows: allTasks }]) {"))
print('BROKE 20/21: the export writes every dated task in the workspace, filter or no filter')
