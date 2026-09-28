# A LOAD BUTTON THAT ONLY LOADS WHEN CLICKED: scrolling to it loads nothing.
# Reddens: inbox-scope: "scrolling to the end loads the rest — 59 rows, the oldest included — and \"Load older\" goes away"Load older"scrolling to the end loads the rest — 59 rows, the oldest included — and \"Load older\" goes away"
import io
p = '/home/user/rundesk/apps/web/src/components/load-older.tsx'
a = "    if (!el || !auto || failed || loading || typeof IntersectionObserver === 'undefined') return\n"
b = '    if (el || !el) return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-19-no-autoload: applied")
