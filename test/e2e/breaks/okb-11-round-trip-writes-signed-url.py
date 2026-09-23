# THE ROUND TRIP AS IT WAS: the signed URL the GET handed out is written over the key.
# Reddens: object-key-boundaries: "the signed URL a meeting hands out, sent back with an edit, leaves the durable key in place"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '    const own = this.r2.keyFromOwnUrl(value)\n'
b = '    const own: string | null = null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-11-round-trip-writes-signed-url: applied")
