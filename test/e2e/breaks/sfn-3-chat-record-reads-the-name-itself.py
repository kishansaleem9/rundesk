# ONE ROUTE GOES ROUND THE RULE: the chat attachment record trims the name itself, and a record with none answers 500.
# Reddens: object-key-boundaries: "an upload with no file name is given a safe one on every route that names an object — not a 500"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "        fileName: safeFileName(data.fileName),\n"
b = "        fileName: (data.fileName as string).trim(),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfn-3-chat-record-reads-the-name-itself: applied")
