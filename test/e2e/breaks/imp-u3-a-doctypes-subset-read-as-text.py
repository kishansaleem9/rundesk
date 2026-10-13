# AN XML DOCTYPE ENDS AT ITS FIRST '>': its internal subset is not skipped whole, and what
# follows the first declaration in it is read as the document.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: xml-scan.test.ts "skips comments, processing instructions and a DOCTYPE, whose entities are never expanded"
import io
p = '/home/user/rundesk/apps/api/src/common/import/xml-scan.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        if (ch === '[') depth++\n        else if (ch === ']') depth--\n        else if (ch === '>' && depth <= 0) break\n",
     "        if (ch === '>') break\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u3-a-doctypes-subset-read-as-text: the subset ends at its first >')
