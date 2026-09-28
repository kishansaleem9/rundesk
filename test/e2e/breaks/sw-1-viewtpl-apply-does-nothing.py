# NOTE: this duplicates the pre-existing `sw-12-viewtpl-apply-is-dead.py` exactly (same
# anchor, equivalent replacement). It was written before that file was noticed and its
# result is recorded in break-space-wizard.txt under this name; either one can be dropped.
# The Use button on a Default-View-Template card stops moving anything: its
# `onClick` no longer calls `setViews`/`setDefaultView`, so the tab becomes four
# named cards over nothing — the dead control, one per workflow.
# Reddens: space-wizard: "applying a view set moves the switches underneath it — Project brings Gantt on, and Marketing moves them "
import io

p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "                    onClick={() => {\n                      setViews([...p.views])\n                      setDefaultView(p.defaultView)\n                    }}"
b = "                    onClick={() => {}}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: pressing a view set changes nothing underneath it.')
