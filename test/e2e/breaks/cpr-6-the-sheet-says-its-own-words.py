# THE TASK SHEET SAYS ITS OWN WORDS FOR A REFUSED MEETING, as it did: the person is not told why.
# Reddens: calendar-push-reach: "and the task sheet’s Google Meet button says why, in the server’s words — not that the meeting could not be created"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    onError: (err) => toast.error(refusalMessage(err, t('taskDetail.meetings.createError'))),\n"
b = "    onError: () => toast.error(t('taskDetail.meetings.createError')),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-6-the-sheet-says-its-own-words: the sheet says "could not create the meeting"')
