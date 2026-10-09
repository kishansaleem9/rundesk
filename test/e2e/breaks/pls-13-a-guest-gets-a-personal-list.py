# A GUEST GETS A PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "a guest has none: asked for, it is nothing; Home’s card of it is empty; adding to it is refused in words (403); and none is made (read by SQL)"
#
# A guest, who makes no task of their own here, is given a list of their own anyway.
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/personal-list.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (!member || member.role === 'guest') return null\n",
     '  if (!member) return null // BROKEN: a guest gets one\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-13-a-guest-gets-a-personal-list: A GUEST GETS A PERSONAL LIST.')
