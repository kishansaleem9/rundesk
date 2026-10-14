# THE TRANSCRIPT IS NOT KEPT.
# (`commit-log/log-39863ff-1`)
#
# The meeting record is written, with notes where a model wrote them, and the
# transcript they were written from is thrown away — who said what is gone.
#
# Reddens: ai-notetaker: "once the bot’s recording is done its meeting is written: the transcript as who said what, the members who spoke as attendees and anybody else by name"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "      if (transcript) await this.db.update(meetings).set({ transcript }).where(eq(meetings.id, meeting.id))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      void meetings\n"))
print('notetaker.service.ts: the transcript is not written onto the meeting.')
