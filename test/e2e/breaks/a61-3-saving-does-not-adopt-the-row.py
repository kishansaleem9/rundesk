# Saving a new meeting does not remember which row it made.
#
# `setMeetingId(m.id)` goes from `onSuccess`, so the panel stays in
# "unsaved" mode: the button keeps reading Save, and pressing it again POSTs a
# SECOND meeting with the same title, time and notes. Every edit is a new
# meeting, and the list fills with near-duplicates of one conversation.
#
# The suite's check is on the button's label — "saving switches the button to
# Update — the row exists now" — which is the cheapest possible reading of
# whether the panel knows what it just created, and the only one available
# before a reload.
#
# `meetingId` is also what the "Start a new one" control clears and what the
# PATCH branch keys on, so the line is one of four places that state is
# touched; losing it in a success handler that already does four other things
# is unremarkable.
#
# REDDENS TWO, AND THE SECOND WAS NOT THE ONE PREDICTED. The button never
# becomes Update, as expected. The other failure is "the recording link is kept
# and offered" — `Open recording` renders from the loaded meeting, and without
# `meetingId` there is nothing loaded, so the link the person just pasted
# disappears from the panel the moment they save it. I predicted the
# title-clears check instead, which is further down and never reached.
#
# The reload checks pass, which is the tell: the first save really did create
# the row, with the recording url on it. Only the panel has forgotten.
#
# Reddens: a61-meeting-record: "saving switches the button to Update — the row exists now"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
a = """      setError(null)
      setMeetingId(m.id)
      onMeetingChange({ id: m.id, title: m.title })
"""
b = """      setError(null)
      onMeetingChange({ id: m.id, title: m.title })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-ai-page.tsx: saving no longer adopts the row it created.')
