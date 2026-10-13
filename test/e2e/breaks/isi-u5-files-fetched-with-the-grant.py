# A FILE REDIRECTED OFF THE TOOL IS FETCHED WITH THE GRANT, FROM ANY ADDRESS.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "fetches a file off the tool only from a public address, and never with the grant; one past the limit is none"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-http.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      return this.isOwn(next) ? this.file(next, maxBytes) : publicFile(next, maxBytes)\n',
     "      const there = await this.fetchImpl(next, { headers: this.headers }).catch(() => null)\n      return there?.ok ? { buffer: Buffer.from(await there.arrayBuffer()), contentType: 'application/octet-stream' } : null\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u5-files-fetched-with-the-grant: A FILE REDIRECTED OFF THE TOOL IS FETCHED WITH THE GRANT, FROM ANY ADDRESS.')
