# The reminder dialog pre-fills the time in UTC instead of the reader's own
# clock.
#
# `<input type="datetime-local">` takes and shows LOCAL wall-clock time, with no
# zone attached — so handing it an ISO string sliced out of a UTC instant puts
# somebody else's clock in the box. The offset arithmetic this removes is the
# only thing translating between the two, and it looks like exactly the kind of
# line that gets deleted for being obscure: a subtraction of
# `getTimezoneOffset()` from a timestamp, immediately before a `toISOString()`
# that suggests the value is already in the right shape.
#
# The failure is quiet and wrong in the worst direction. In Karachi the box
# opens five hours behind — so "remind me in an hour" is pre-filled as four
# hours AGO, and pressing Set stores a reminder that has already passed and
# never fires. Nothing errors, and the number in the box is a plausible time of
# day.
#
# One check — and writing this patch found two reasons it could not have failed.
#
#  1. THE CHECK ASSERTED ONLY THE SHAPE. `the time field is pre-filled and
#     local` tested `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$` and nothing else, so a
#     box filled from a UTC instant matched it perfectly. The word "local" was
#     doing no work at all. It now computes the expected wall-clock string IN
#     THE PAGE and compares, within three minutes.
#  2. THE SUITE RAN IN UTC, which is the one zone where this is invisible: the
#     offset is zero, so the correct arithmetic and its absence produce the
#     same string. The context is `Asia/Karachi` now — +05:00, no DST, and
#     where the person in the walkthrough is.
#
# Neither of those is a fact about this patch; both are facts about a check that
# named a property it never read, in a container whose clock made the property
# untestable. The dialog opens, closes, stores and points at the message either
# way.
#
# Reddens: chat-message-actions: "the time field is pre-filled and local"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = """  const inAnHour = new Date(from.getTime() + 60 * 60 * 1000)
  const local = new Date(inAnHour.getTime() - inAnHour.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
"""
b = """  const inAnHour = new Date(from.getTime() + 60 * 60 * 1000)
  return inAnHour.toISOString().slice(0, 16)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: the reminder box is pre-filled in UTC.')
