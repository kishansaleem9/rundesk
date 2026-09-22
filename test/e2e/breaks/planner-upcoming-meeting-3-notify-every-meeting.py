# Notify for every upcoming meeting rather than for the one that can be joined. The
# switch works, notifications appear, and a check that only asked 'did it notify' would
# pass on a product that pages you three hours early.
#
# Reddens: planner-upcoming-meeting: "exactly one desktop notification is raised — not one per meeting in the list"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        if (!isJoinable(meeting.startsAt) || notified.current.has(meeting.id)) continue'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '        if (notified.current.has(meeting.id)) continue // BREAK: every meeting, not the joinable one'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dropped the joinable gate from the desktop notification')
