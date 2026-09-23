# A CURSOR THAT NAMES NO MESSAGE HERE, IGNORED — the newest page again, which is what paging
# back from a stale id used to loop on.
# Reddens: chat-history: "a cursor from another channel, and a page of 500, are refused with nothing listed"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "      if (!anchor) throw new BadRequestException('before must be a message in this channel')\n"
b = '      if (!anchor) opts = { ...opts, before: undefined }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-4-foreign-cursor-ignored: applied")
