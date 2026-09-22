# A new meeting is saved without the attendees that were picked.
#
# `attendeeIds` goes from the POST body. The chips toggle, the picked ones look
# picked, the meeting saves and the button switches to Update — and nobody is on
# it. Reopen it and every chip is off, which is the check that fails: "the
# attendee list comes back."
#
# It is the half of the record that no other surface would contradict. A
# meeting with the right title, the right time and the right notes looks
# complete, and "who was there" is the field you go back for weeks later, when
# there is nothing to compare it against.
#
# The POST and the PATCH differ by exactly this key — the PATCH diffs attendees
# separately, in its own loop, for the reason its comment gives — so the POST's
# `attendeeIds` reads as a duplicate of work happening elsewhere.
#
# ONE CHECK. Saving works, the button switches, the recording link is kept, the
# notes come back after a reload. Only the attendee chips are off, and they are
# read after a full page reload rather than from the form — which is what makes
# it a check about the record rather than about the chips.
#
# Reddens: a61-meeting-record: "the attendee list comes back"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
a = "          body: { ...body, recordingUrl: recordingUrl.trim() || null, attendeeIds },"
b = "          body: { ...body, recordingUrl: recordingUrl.trim() || null },"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-ai-page.tsx: a new meeting is saved with no attendees.')
