# A TASK TICKED OFF A PRIORITIES LIST, ADDED AGAIN, STAYS TICKED OFF, asked of the service itself (`found-29-sep/priority-readd-answers-a-ticked-off-row`).
# Reddens: unit: people.service.test.ts "puts a ticked-off row back: open, at the end, added by the one adding it now"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "        if (existing?.doneAt) {\n"
b = "        if (false && existing?.doneAt) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-33-a-ticked-off-row-is-answered-as-it-was-unit: a done row is answered as it was')
