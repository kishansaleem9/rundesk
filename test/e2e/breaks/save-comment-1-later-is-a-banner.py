# The Inbox bucket stops excluding snoozed rows, so a comment saved for Later
# sits in BOTH tabs at once.
#
# Later becomes a banner rather than a bucket: saving something moves nothing,
# the Inbox count does not fall, and the only visible effect of pressing Save
# is that the row is now listed twice. The suite names this exact failure in
# its own message — "saved comments render in the Inbox tab too, so the Later
# check proves nothing" — because a Later check alone cannot tell a move from
# a copy.
#
# Reddens: save-comment: "and the Inbox tab does not — Later is a bucket, not a banner"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = """        return and(
          isNull(notifications.dismissedAt),
          or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
        )
"""
b = """        return isNull(notifications.dismissedAt)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notifications.service.ts: the Inbox bucket lists rows that are saved for Later.')
