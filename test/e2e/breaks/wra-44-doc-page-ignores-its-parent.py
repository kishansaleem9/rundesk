# A PAGE JUDGED BY ITS OWN SPACE ALONE: the docs hub makes pages with none, so every page under a private doc opens.
# Reddens: workspace-read-access: "a member cannot open a doc of a space they are refused, nor the page under it (403 “This space or project is private”) — while they open an open doc, and a doc and page shared with them; the admin opens all five"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '  let cursor = doc.parentDocId\n'
b = '  let cursor: string | null = null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-44-doc-page-ignores-its-parent: applied")
