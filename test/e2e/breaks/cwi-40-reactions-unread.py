# NO MESSAGE IS ASKED FOR ITS REACTIONS.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a message’s reactions come in as the members’ reactions here (a 👍 from Ana; one from somebody ClickUp no longer has, not); a file posted in Chat is the message’s file here, with its bytes, its link gone from the words, and a message that was only an image is that image"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('const MAX_REACTION_READS = 1_500\n',
     'const MAX_REACTION_READS = 0\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-40-reactions-unread: NO MESSAGE IS ASKED FOR ITS REACTIONS.')
