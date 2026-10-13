# A SLACK MESSAGE BY SOMEBODY WHO IS NOT A MEMBER IS THE IMPORTER'S: no name of its
# own is kept, so Chat draws it as the words of whoever imported it.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "by SQL: #general came in as general-slack (the workspace has its own), Ana’s words under Ana at the moment she wrote them, Ben’s under his name, the reply in its thread, Ana mentioned as herself, her 👍 and not Ben’s, #random left out"
#   or "in Chat, Ben’s message is drawn under his name and marked imported — not as the words of the person who imported it"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/slack-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            importedAuthor: author ? null : m.name.slice(0, 200),\n',
     '            importedAuthor: null,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-9-a-strangers-message-under-the-importer: an outsider's message keeps no name")
