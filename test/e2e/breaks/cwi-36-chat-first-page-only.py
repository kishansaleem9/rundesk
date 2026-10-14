# ONLY A CHANNEL’S FIRST PAGE OF MESSAGES COMES IN.
# (`found-14-oct/clickup-chat-unimported`)
# Reddens: clickup-workspace-import: "its Chat comes over: a public channel public and a private one private with its people, every page of messages each at its moment, a thread’s replies in its thread, Nina’s message (not a member yet) drawn under her name and its mention of Ana a mention of her, ClickUp’s own post under ClickUp; the report says 13 messages"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!next || !rows.length || next === cursor) break\n      cursor = next\n    }\n    return out\n  }\n',
     "      if (next !== '\\u0000') break\n      cursor = next\n    }\n    return out\n  }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-36-chat-first-page-only: ONLY A CHANNEL’S FIRST PAGE OF MESSAGES COMES IN.')
