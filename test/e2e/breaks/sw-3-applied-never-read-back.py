# `applied` stops being read off the switches: no card ever reports itself
# applied, so a set that IS in effect still offers "Apply" and the panel can no
# longer tell you where you are. This is the half of the check that asserts the
# Marketing card knows its own set is already in effect — the stale reason.
# Reddens: space-wizard: "applying a view set moves the switches underneath it — Project brings Gantt on, and Marketing moves them back to Calendar on and Gantt off"
import io

p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "              const applied =\n                p.views.length === effectiveViews.length &&"
b = "              const applied =\n                false &&\n                p.views.length === effectiveViews.length &&"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: no view-set card ever reports itself applied.')
