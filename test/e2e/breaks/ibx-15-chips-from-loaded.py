# THE CHIPS AS THEY WERE: counted from the rows already loaded.
# Reddens: inbox-scope: "the chips count what the server holds — 60 and 59 — not the fifty loaded"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-inbox-page.tsx'
a = '    all: inView(counts),\n    primary: inView(primaryCountsQuery.data),\n'
b = '    all: notifs.length,\n    primary: notifs.filter((n) => primaryTypes.has(n.type)).length,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-15-chips-from-loaded: applied")
