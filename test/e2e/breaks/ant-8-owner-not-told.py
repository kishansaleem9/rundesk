# NOBODY IS TOLD THE NOTES ARE READY.
# (`commit-log/log-39863ff-1`)
#
# ClickUp's notes land in the Inbox once the meeting ends. These are written and
# said nowhere: the person learns of them only by opening the Meetings page.
#
# Reddens: ai-notetaker: "and its owner is told in the Inbox, the notice opening the meeting"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "      await this.notifications\n        .create({"
b = "      if (false as boolean) await this.notifications\n        .create({"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: the Inbox is not told.')
