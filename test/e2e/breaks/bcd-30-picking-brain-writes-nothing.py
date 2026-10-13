# Picking Brain closes the picker and writes no @Brain.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "picked, it writes @Brain; posted, the thread shows Brain answering and then its reply, marked as Brain’s"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '                    setText(`${cut ? text.slice(0, cut.index) : text}@Brain `)\n'
b = '                    setText(cut ? text.slice(0, cut.index) : text)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-30-picking-brain-writes-nothing: Picking Brain closes the picker and writes no @Brain.')
