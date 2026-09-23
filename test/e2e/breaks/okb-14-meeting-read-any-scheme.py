# THE READ SIDE'S SCHEME TEST AS IT WAS: anything containing `://` passed as a link.
# Reddens: object-key-boundaries: "a meeting whose stored pointer is another workspace’s key, or a script, hands out no link — while a call recording of its own does"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '    if (/^https?:\\/\\//i.test(stored)) return stored\n'
b = "    if (stored.includes('://')) return stored\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-14-meeting-read-any-scheme: applied")
