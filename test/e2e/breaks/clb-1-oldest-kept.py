# THE LIBRARY KEEPS THE OLDEST 200: every page is read, and the wrong end kept.
# Reddens: clip-library: "with ${CLIPS} clips, the library lists the newest ${LISTED}, the newest first — not the oldest"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0) || (a.Key! < b.Key! ? 1 : a.Key! > b.Key! ? -1 : 0))\n'
b = '      .sort((a, b) => (a.LastModified?.getTime() ?? 0) - (b.LastModified?.getTime() ?? 0) || (a.Key! < b.Key! ? -1 : a.Key! > b.Key! ? 1 : 0))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clb-1-oldest-kept: the library keeps the oldest 200')
