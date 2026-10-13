# Where no model answers, @Brain is posted and nothing says it will not be answered.
# Reddens only where no model answers: its target is what the composer says when Brain cannot answer.
# Reddens: brain-comments-and-decks: "picked, it writes @Brain; posted, the thread shows Brain answering and then its reply, marked as Brain’s"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '      setBrainRefused(posted.mentionsBrain && brainUnavailable)\n'
b = '      setBrainRefused(false)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-32-no-word-when-brain-cannot-answer: Where no model answers, @Brain is posted and nothing says it will not be answered.')
