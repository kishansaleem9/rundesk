# THE CHANNEL AS IT WAS WHILE ITS FIRST PAGE LOADED: an empty array, drawn as "the start of the
# conversation".
# Reddens: chat-history: "while the first page loads the list is shapes — not "the start of the conversation""
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '          {selectedId && messagesQuery.isPending ? (\n'
b = '          {false ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-7-empty-while-loading: applied")
