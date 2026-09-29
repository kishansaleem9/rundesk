# MEILI'S FILE HITS UNCHECKED, as they were: every file the index ranks, a refused space's included
# (found-29-sep/meili-file-hits-skip-the-read-rule).
# Reddens: unit: search.service.test.ts "holds a file hit to its task’s reach, privacy and bin, and drops one the database does not return"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "    const fileHits = hits.filter((h) => h.entityType === 'file')\n    if (fileHits.length > 0) {\n"
b = "    const fileHits = hits.filter((h) => h.entityType === 'file')\n    if (fileHits.length > 0 && false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-4-meili-file-hits-untouched: applied")
