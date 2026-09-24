# THE HEAT MAP'S PANE HAS NO HEIGHT AGAIN: its header goes with the page.
# Reddens: sticky-headers: "the workload heat map’s header stays at the top of its pane while its rows scroll under it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-workload-page.tsx'
a = '        <div className="max-h-[70vh] overflow-auto">\n          <div className="min-w-max">\n            {/* Header row */}\n'
b = '        <div className="overflow-x-auto">\n          <div className="min-w-max">\n            {/* Header row */}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sth-3-heat-pane-unbounded: the heat map pane is unbounded')
