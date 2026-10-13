# A REDIRECT TAKES THE GRANT ANYWHERE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "refuses an address off the tool’s own origins — a redirect to one included — and sends the grant to none of them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        target = this.checked(new URL(res.headers.get('location')!, target).toString())\n",
     "        target = new URL(res.headers.get('location')!, target).toString()\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u4-redirects-anywhere: A REDIRECT TAKES THE GRANT ANYWHERE.')
