# THE TAG EDITOR SAVES WHAT THE TEMPLATE ALREADY HAD (`ledger-rows/row-1874`).
#
# The chips change in the dialog, Save answers 200 with a toast, and the list
# sent is the template's own, so nothing changes: an edit that reports success.
#
# Reddens: template-center: "the tag icon on its card changes a saved template's tags — launch day off, Retro typed on — and the database holds q3 and retro"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "        body: { tags },\n"
b = "        body: { tags: template?.tags ?? [] }, // BROKEN: the old tags are sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-27-edit-sends-the-old-tags: the tag editor saves the tags the template had')
