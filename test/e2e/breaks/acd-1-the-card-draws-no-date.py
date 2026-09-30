# The attachment card draws no date again, as before
# `found-30-sep/attachment-card-draws-no-date`: size and uploader only.
#
# Reddens: task-attachments: "each card says when its file was attached — the server's date, with its year"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    {a.createdAt ? (
                      <>
                        {' · '}
                        <time
                          data-testid="attachment-date\""""
b = """                    {false ? (
                      <>
                        {' · '}
                        <time
                          data-testid="attachment-date\""""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the card says nothing of when the file was attached.')
