# A SHEET WHOSE SOCKET OPENS LATE READS NOTHING AFRESH (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`).
#
# A page reads its data as it mounts, and a socket not open yet holds the rooms
# it asks for until it is. The sheet asks for its task's room through
# `joinRooms`, and once the server answers it reads the task afresh. Let it ask
# for no answer, and a sheet whose socket joins after a change goes on showing
# what it read.
#
# Re-aimed 7 October: the first opening asked again for every room and read
# every query afresh; each page's own answer does that now
# (`found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`), so this
# takes the sheet's.
#
# Reddens: task-sheet-fetches:
#   "a sheet whose socket joins only after the change shows it once it does, without a reload"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    joinRooms(socket, [`task:${taskId}`], () => void qc.invalidateQueries({ queryKey: ['task', taskId] }))\n"
b = "    joinRooms(socket, [`task:${taskId}`])\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-5-a-late-socket-reads-nothing-afresh: the sheet asks for its room with no answer, and reads nothing afresh')
