# CHAT DRAWS AN IMPORTED MESSAGE AS ANY OTHER: under the person who imported it, unmarked —
# it takes an imported message for one with no author's name, and the server always sends one.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "in Chat, Ben’s message is drawn under his name and marked imported — not as the words of the person who imported it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                          {m.importedAuthor ? (\n',
     '                          {!m.authorName && m.importedAuthor ? (\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-14-an-imported-message-drawn-as-the-importers: an imported message is drawn as a member's")
