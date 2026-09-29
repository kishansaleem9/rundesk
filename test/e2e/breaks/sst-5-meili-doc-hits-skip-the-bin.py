# MEILI'S DOC HITS NOT HELD TO THE BIN, as they were: a deleted doc is still found
# (found-29-sep/meili-finds-deleted-docs).
# Reddens: unit: search.service.test.ts "holds a doc hit to the archived rule, a manager’s too, and drops one the database does not return"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "          includeArchived ? undefined : eq(docs.isArchived, false),\n        ))\n      const found"
b = "        ))\n      const found"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-5-meili-doc-hits-skip-the-bin: applied")
