# THE MEMBERS WHO SPOKE ARE NOT ATTENDEES.
# (`commit-log/log-39863ff-1`)
#
# The meeting record lists its organiser alone, though the transcript names a
# colleague who spoke: "my meetings" never finds it for them.
#
# Reddens: ai-notetaker: "once the bot’s recording is done its meeting is written: the transcript as who said what, the members who spoke as attendees and anybody else by name"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "        attendeeIds: members.map((m) => m.id),\n"
b = "        attendeeIds: [],\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: the members who spoke are not made attendees.')
