# A POSTED DOWNLOAD IGNORES THE NAME THE RESPONSE GIVES: passed none, it saves "download".
# Reddens: file-exports: "Settings’ Export JSON, Export tasks CSV and the members’ Export CSV, and the report builder’s Export PDF, each save the file under the name the server gives it — the report under its own name"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "  a.download = filename ?? filenameFromContentDisposition(res.headers.get('content-disposition')) ?? 'download'\n  document.body.appendChild(a)\n  a.click()\n  a.remove()\n  URL.revokeObjectURL(url)\n}\n\nexport async function api<T = unknown>("
b = "  a.download = filename ?? 'download'\n  document.body.appendChild(a)\n  a.click()\n  a.remove()\n  URL.revokeObjectURL(url)\n}\n\nexport async function api<T = unknown>("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fex-16-a-posted-download-ignores-the-server-s-name: api.ts: a posted download ignores the name the response gives.')
