# A SOCKET OPENED AGAIN JOINS NO ROOM ITS PAGES HOLD (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# A socket opened again is a new one, in no room but its person's own, and a
# page subscribes its rooms once, when it mounts. The tab asks again for the
# rooms it held when its socket dropped; drop that and the other tab hears its
# own channel after another tab's sign-in, and nothing of the list it shows.
#
# Also reddens the sign-in-again check: a socket reopened after the server
# closed it needs its rooms joined again just the same. Re-aimed 6 October
# onto `rejoinAndCatchUp`, which now also reads the page afresh once the rooms
# are held: with neither, the task made after is never drawn.
#
# Reddens: session-in-the-browser:
#   "when the person signs out and back in from one tab, another tab of the same browser opens its realtime socket again on the new session without a reload: a message in their own private channel is heard there, and the list it shows draws a task made after, as before"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "    rejoinAndCatchUp(socket, rooms.rejoin(), () => void queryClient.invalidateQueries({ refetchType: 'active' }))\n"
b = "    void rooms.rejoin()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-10-rooms-are-not-joined-again: a socket opened again asks for none of its pages’ rooms')
