# Reopening a saved meeting brings back everything except the notes.
#
# `if (m) onLoadNotes(m.notes ?? '')` goes from `loadMeeting`. The title, the
# time, the recording link and the attendees all return; the notes box stays
# holding whatever was in it, which after a reload is empty. So the record
# survives the page and the only part anybody wrote by hand does not.
#
# The suite calls the reload "the point of the whole thing", and this is the
# worst way to fail it: four of the five fields come back, so the panel looks
# like it worked. An empty notes box beside a correctly restored title reads as
# "I never wrote anything", not as "the app lost it".
#
# `onLoadNotes` is a prop and the notes live OUTSIDE this component — that is
# why it is a callback rather than a `setState` beside the other four — so the
# line looks like a side effect on somebody else's state, guarded by an `if`
# that the four lines above it do not need.
#
# ONE CHECK. The meeting is still listed after the reload, the recording link
# still comes back, the attendees still come back. Only the notes check fails,
# which is why the suite reads the textarea's value for a phrase from the notes
# rather than asking whether the form populated.
#
# Reddens: a61-meeting-record: "reopening it brings the notes back"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
a = "    if (m) onLoadNotes(m.notes ?? '')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-ai-page.tsx: reopening a meeting no longer restores its notes.')
