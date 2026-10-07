# THE PAGE SAVES UNDER THE ASCII `filename` and never reads `filename*`: a zip the server named after a task
# titled in Arabic is saved under the ASCII left of its title. As `tat-13`, a browser check sees it only
# since the lanes run their suites in a UTF-8 locale (`found-30-sep/lanes-save-downloads-in-ascii`).
# Reddens: task-attachments: "and a task titled in Arabic has its zip saved under that title, not as \"download\""
import io
p = '/home/user/rundesk/apps/web/src/lib/content-disposition.ts'
a = "  const extended = /filename\\*\\s*=\\s*([^']*)'[^']*'([^;]+)/i.exec(header)\n"
b = '  const extended = null as RegExpExecArray | null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tat-14-the-page-saves-under-the-ascii-name: content-disposition.ts: filename* is never read; the page saves under the ASCII name.')
