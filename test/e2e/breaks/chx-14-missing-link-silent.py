# A LINK TO A MESSAGE THAT IS NOT HERE, AND NOT A WORD: it pages to the start and stops.
# Reddens: chat-history: "and a link to a message this channel does not hold says so, after looking"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '    toast.error(\n      messagesQuery.hasNextPage'
b = '    console.debug(\n      messagesQuery.hasNextPage'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-14-missing-link-silent: applied")
