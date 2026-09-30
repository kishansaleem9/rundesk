# THE PAGE IGNORES filename* (`found-30-sep/attachments-have-no-download-all`): a download is saved under the
# plain ASCII `filename`, so a zip the server named after a task titled in Arabic or Urdu is saved as
# "task-attachments.zip".
# Reddens: unit: content-disposition.test.ts "a download takes its name from Content-Disposition, preferring the UTF-8 filename*"
import io
p = '/home/user/rundesk/apps/web/src/lib/content-disposition.ts'
a = "  const extended = /filename\\*\\s*=\\s*([^']*)'[^']*'([^;]+)/i.exec(header)\n"
b = "  const extended = null as RegExpExecArray | null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-22-the-download-ignores-filename-star-unit: filename* is never read')
