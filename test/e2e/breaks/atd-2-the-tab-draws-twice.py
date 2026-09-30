# THE TAB DRAWS TWICE, AS IT DID (`found-30-sep/attachments-tab-draws-twice`, both halves put back): the
# task's own rows are drawn until the list answers, and the upload form only once it has, so when it
# answers the form comes in above cards already drawn and every card moves down by its height.
# It also reddens the Download-at-first-draw check, as `atd-1` does alone.
# Reddens: task-attachments: "the first card is drawn where it stays — its box when it first appears is its box once the list has answered"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """  const waiting = listed === undefined && !probe.isError
  const attachments: Attachment[] = listed ?? (waiting ? [] : inline.map(attachmentFromTaskRow))
  const count = waiting ? inline.length : attachments.length
  const uploadWired = !notWired
"""
b = """  const waiting = false
  const attachments: Attachment[] = listed ?? inline.map(attachmentFromTaskRow)
  const count = waiting ? inline.length : attachments.length
  const uploadWired = !notWired && listed !== undefined
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the attachments tab draws the task\'s rows first, then the form above them when the list answers.')
