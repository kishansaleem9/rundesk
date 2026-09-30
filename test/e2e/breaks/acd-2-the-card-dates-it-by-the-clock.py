# The card dates the file by the reader's clock rather than the server's
# createdAt: a date is drawn, and it is the wrong one whenever the page is read
# on another day than the file was attached.
#
# Reddens: task-attachments: "each card says when its file was attached — the server's date, with its year"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                          dateTime={a.createdAt}
"""
b = """                          dateTime={new Date(Date.now() + 86_400_000).toISOString()}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the card dates the file by the clock.')
