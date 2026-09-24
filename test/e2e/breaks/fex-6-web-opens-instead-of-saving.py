# THE WEB OPENS A POSTED EXPORT IN A TAB INSTEAD OF SAVING IT: the file is never saved.
# Reddens: file-exports: "Insights → Download PDF saves a .pdf that begins %PDF-"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`)\n  const blob = await res.blob()\n  const url = URL.createObjectURL(blob)\n  const a = document.createElement('a')\n  a.href = url\n  a.download = filename\n  document.body.appendChild(a)\n  a.click()\n  a.remove()\n  URL.revokeObjectURL(url)\n}\n\nexport async function api"
b = "  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`)\n  const blob = await res.blob()\n  const url = URL.createObjectURL(blob)\n  void filename\n  window.open(url, '_blank')\n}\n\nexport async function api"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-6-web-opens-instead-of-saving: applied")
