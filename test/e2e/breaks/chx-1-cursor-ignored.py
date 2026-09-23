# THE CURSOR AS IT WAS BEFORE §6 WIRED IT: `before` validated and then not applied — every page
# is the newest page.
# Reddens: chat-history: "paging back 100 at a time reaches all 230, each once, in order"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '      opts.before\n        ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select m.created_at, m.id from ${chatMessages} m where m.id = ${opts.before})`\n        : undefined,\n'
b = '      undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-1-cursor-ignored: applied")
