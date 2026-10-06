# THE RULE’S MEMBERSHIP HALF IS NOT ASKED: the read rule alone decides, and it lets a platform admin in wherever they
# are, so their connection goes on taking a workspace’s tasks after they have been removed from it.
# Reddens: calendar-push-reach: "a platform admin’s calendar takes a workspace’s task while they are a member of it, and nothing once they have been removed — the read rule would let them in wherever they are, so the membership is asked of them too — and their connection is kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    if (!member) return false\n'
b = '    void member\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-7-the-membership-is-not-asked: the membership is not asked')
