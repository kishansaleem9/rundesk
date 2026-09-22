# Every card names the first preset's views — four cards that can only ever say one thing.
# Reddens: space-wizard: "the tab offers one named view set per workflow, each naming
#   the views it carries"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "                      {p.views.map(viewLabel).join(', ')}\n"
b = "                      {(presets[0]?.views ?? []).map(viewLabel).join(', ')}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("create-space-wizard.tsx: Every card names the first preset's views — four cards that can only ever say one thing.")
