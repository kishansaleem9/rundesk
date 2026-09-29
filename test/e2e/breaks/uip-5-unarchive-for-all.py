# THE SHEET OFFERS UNARCHIVE WHATEVER THE CAPABILITY SAYS.
# Reddens: unarchive-in-place: "in a view-only space the sheet says the task is archived and offers no Unarchive"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                {caps.restore === true && (\n'
b = '                {(caps.restore === true || Boolean(1)) && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uip-5-unarchive-for-all: Unarchive offered to all')
