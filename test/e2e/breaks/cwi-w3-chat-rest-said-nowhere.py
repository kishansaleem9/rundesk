# THE REPORT DOES NOT SAY THE REACTIONS AND FILES OF CHAT.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a message’s reactions come in as the members’ reactions here (a 👍 from Ana; one from somebody ClickUp no longer has, not); a file posted in Chat is the message’s file here, with its bytes, its link gone from the words, and a message that was only an image is that image"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {(result.chatReactionsImported ?? 0) > 0 && <Figure testid="import-app-r-reactions" label={t(\'import.appReactions\')} value={result.chatReactionsImported ?? 0} />}\n',
     ''),
    ('        {(result.chatFilesImported ?? 0) > 0 && <Figure testid="import-app-r-chat-files" label={t(\'import.appChatFiles\')} value={result.chatFilesImported ?? 0} />}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-w3-chat-rest-said-nowhere: THE REPORT DOES NOT SAY THE REACTIONS AND FILES OF CHAT.')
