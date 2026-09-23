# THE DEEP LINK AS IT WAS: if the message is not in what is loaded, nothing is fetched.
# Reddens: chat-history: "a link to m005 — two pages back — loads them, and m005 arrives highlighted"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '    if (messagesQuery.hasNextPage && pages < DEEP_LINK_MAX_PAGES) {\n'
b = '    if (false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-13-deep-link-does-not-page: applied")
