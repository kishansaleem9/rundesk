# A FILE THE TOOL REDIRECTS TO ITS STORE IS NOT FOLLOWED THERE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "its custom fields become fields of the List — a number, a dropdown holding every value the issues have — and every comment comes in, the ones past the first read from the issue’s own route; its attachment through Atlassian’s redirect to the file; every page of issues read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      return this.isOwn(next) ? this.file(next, maxBytes) : publicFile(next, maxBytes)\n',
     '      return next ? null : null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-14-redirects-unfollowed: A FILE THE TOOL REDIRECTS TO ITS STORE IS NOT FOLLOWED THERE.')
