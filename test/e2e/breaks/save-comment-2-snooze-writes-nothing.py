# Save-for-later stops writing. The endpoint still answers `{ ok: true }` with
# the timestamp it was asked for, so the button changes state and the toast
# says where to find it again — and no row moved.
#
# The facade, in the shape the suite names: "the button changed and no row was
# written". A reload puts the comment back where it was and nothing explains
# why.
#
# Reddens: save-comment: "and the save reaches the database"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = """    await this.db
      .update(notifications)
      .set({ snoozedUntil: until, dismissedAt: null })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    return { ok: true, snoozedUntil: until.toISOString() }
"""
b = """    return { ok: true, snoozedUntil: until.toISOString() }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notifications.service.ts: save-for-later reports success and writes nothing.')
