# A WORD DOCUMENT'S DELETED REVISION IS KEPT AS TEXT: `w:delText` is read as `w:t` is, and
# `w:del` asks nothing, so words the author struck come back.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: docx-tiptap.test.ts "leaves out a deleted revision, keeps an inserted one, and says where a picture stood"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docx-tiptap.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        case 'delText': if (!tok.selfClosing) inText = false; break\n",
     "        case 'delText': if (!tok.selfClosing) inText = true; break\n"),
    ("        case 'del': if (!tok.selfClosing) deleted++; break\n",
     "        case 'del': break\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u8-a-deleted-revision-kept: w:del is read as text')
