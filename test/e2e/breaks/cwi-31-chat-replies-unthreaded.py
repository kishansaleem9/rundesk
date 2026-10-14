# A THREAD’S REPLIES COME IN AS MESSAGES OF THEIR OWN.
# (`found-14-oct/clickup-chat-unimported`)
# Reddens: clickup-workspace-import: "its Chat comes over: a public channel public and a private one private with its people, every page of messages each at its moment, a thread’s replies in its thread, Nina’s message (not a member yet) drawn under her name and its mention of Ana a mention of her, ClickUp’s own post under ClickUp; the report says 13 messages"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const parent = m.parent ? idOf.get(m.parent) ?? null : null\n',
     '      const parent: string | null = m.parent ? null : null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-31-chat-replies-unthreaded: A THREAD’S REPLIES COME IN AS MESSAGES OF THEIR OWN.')
