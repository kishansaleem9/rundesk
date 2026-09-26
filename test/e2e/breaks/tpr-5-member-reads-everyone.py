# A MEMBER’S TEAM WEEK IS NOT NARROWED TO THEM: the plain member reads everyone’s hours.
# Reddens: time-page-reach: "a member’s team week is their own row alone, and the admin’s holds everyone"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const scope = viewer.kind === 'user'\n      ? eq(timeEntries.userId, viewer.userId)\n"
b = "    const scope = viewer.kind === 'user'\n      ? undefined\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tpr-5-member-reads-everyone: members read every row')
