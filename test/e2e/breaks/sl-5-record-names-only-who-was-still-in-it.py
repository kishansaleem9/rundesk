# The meeting record names only the participants who had not left yet.
#
# THE CONFIDENT ZERO, and the filter is the whole of it. `participantsOf`
# returns every row for the call — everyone who ever joined, each with a
# `leftAt` that is null while they are in it — and one line narrows that to the
# people still in the call when the record is written. Reading it on its own it
# is hard to argue with: a meeting's attendees are the people who were in the
# meeting, and `leftAt == null` is how this codebase says "in it".
#
# What makes it wrong is WHEN the record is written. The record is written by
# the LAST PERSON OUT, from inside `leave`, after their own `leftAt` is
# stamped — so at that instant nobody is in the call by definition, the filter
# returns nothing, and `meetings.create` falls back to the one attendee it adds
# for itself: the organiser, which here is whoever hung up last. A call two
# people spent twenty minutes in leaves a record naming one of them, and the
# other person's own Meetings list never shows it at all.
#
# It is the confident zero rather than a crash because every mechanism around
# it keeps working. The record exists, it has the right title, the right start
# and end, the notes, the recording, and an attendee list that is neither empty
# nor obviously short — it is a list, with a name in it, and the name is real.
#
# PREDICTED ONE. `and it left a meeting record behind` still passes — there is
# a record — and so does `with a place for every piece of its recording`. Only
# the check that counts the people can see it, which is why it counts them
# rather than asking whether the list is non-empty.
#
# THIS PATCH IS WHY THAT CHECK NOW READS THE CALL'S OWN RECORD BY ID. Until
# `syncup-live` was fixed it found "the first meeting in the list starting after
# this call" — and a future-dated meeting seeded by `a39-dm-tabs` outranked the
# real record, so this check reported (1) against somebody else's row and would
# have reddened with the product untouched. A check that fails for the wrong
# reason cannot be broken on purpose.
#
# Reddens: syncup-live: "naming everyone who was there"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = """        attendeeIds: people.map((p) => p.userId),
"""
b = """        attendeeIds: people.filter((p) => p.leftAt == null).map((p) => p.userId),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('calls.service.ts: the record names only whoever had not left yet.')
