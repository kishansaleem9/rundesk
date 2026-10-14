# THE MEETINGS PAGE HAS NO AI NOTETAKER.
# (`commit-log/log-39863ff-1`)
#
# The service and its routes are there and nothing on the page reaches them: no
# box for a meeting's link, no calendars to join — the notetaker exists for
# nobody who uses the product.
#
# Reddens: ai-notetaker: "the Meetings page offers the AI Notetaker: a box for a meeting’s link, and the person’s calendars to join, none yet"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = "\n      <NotetakerPanel workspaceId={workspaceId} />\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '\n'))
print('workspace-meetings-page.tsx: the AI Notetaker panel is not drawn.')
