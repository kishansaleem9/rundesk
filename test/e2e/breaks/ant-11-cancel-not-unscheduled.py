# CALLED BACK HERE, THE BOT GOES ANYWAY.
# (`commit-log/log-39863ff-1`)
#
# "Call back" marks the visit cancelled and never tells the meeting-bot service:
# the bot still joins the meeting at its start, recording people who were told
# it would not.
#
# Reddens: ai-notetaker: "a scheduled visit is called back — unscheduled at the service — and is not sent again"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "    if (row.vendorBotId) {\n      await removeBot("
b = "    if (false as boolean && row.vendorBotId) {\n      await removeBot("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: calling back does not tell the service.')
