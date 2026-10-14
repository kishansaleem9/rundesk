# A NOTETAKER SENT BY ITS LINK WAITS AN HOUR.
# (`commit-log/log-39863ff-1`)
#
# "Send AI Notetaker" to a meeting under way schedules the bot as if for a
# calendar's meeting to come: it joins an hour later, when the meeting is over.
#
# Reddens: ai-notetaker: "sent by its link, the notetaker joins now: a bot asked for that meeting by its name, and the visit listed as joining"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "    return this.toRun(await this.dispatch(cfg, row, null))"
b = "    return this.toRun(await this.dispatch(cfg, row, new Date(Date.now() + 3_600_000)))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: a notetaker sent by its link joins an hour later.')
