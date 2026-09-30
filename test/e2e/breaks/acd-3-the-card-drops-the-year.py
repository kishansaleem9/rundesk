# The card draws the day and month alone ("Sep 30"), as ClickUp does and as
# its feedback board asks it to stop doing: a file from last year reads as this
# year's.
#
# Reddens: task-attachments: "each card says when its file was attached — the server's date, with its year"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                          {formatDate(a.createdAt)}
                        </time>"""
b = """                          {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </time>"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the card leaves the year out.')
