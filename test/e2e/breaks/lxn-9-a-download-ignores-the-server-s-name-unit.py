# A DOWNLOAD IGNORES THE NAME THE SERVER GIVES (`found-30-sep/list-export-saved-as-list-csv`): with no name from
# its caller, a file is saved as "download", not under the response's `Content-Disposition`.
# Reddens: unit: download-file.test.ts "with no name given, a download is saved under the name the response gives; with one, under that"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "  a.download = filename ?? filenameFromContentDisposition(res.headers.get('content-disposition')) ?? 'download'\n"
b = "  a.download = filename ?? 'download'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-9-a-download-ignores-the-server-s-name-unit: Content-Disposition is never read')
