# A FILE POSTED IN CHAT STAYS A LINK IN ITS WORDS.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a message’s reactions come in as the members’ reactions here (a 👍 from Ana; one from somebody ClickUp no longer has, not); a file posted in Chat is the message’s file here, with its bytes, its link gone from the words, and a message that was only an image is that image"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return u.origin === new URL(apiUrl()).origin && u.pathname.includes(\'/attachments/\')\n',
     '    return u.origin === new URL(apiUrl()).origin && u.pathname.includes(\'/no-such-place/\')\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-41-chat-files-left-in-words: A FILE POSTED IN CHAT STAYS A LINK IN ITS WORDS.')
