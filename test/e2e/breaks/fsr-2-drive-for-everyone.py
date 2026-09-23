# EVERY MEMBER SEARCHES THE CONNECTOR'S DRIVE.
# Reddens: unit: search.service.test.ts "searches the connected Drive for the person who connected it, and for nobody else"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '    if (conn.connectedById !== userId) return []\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fsr-2-drive-for-everyone: applied")
