# MEILI'S DOC HITS UNCHECKED, as they were: every doc the index ranks, a private space's included.
# Reddens: unit: search.service.test.ts "drops a doc hit filed in a space the searcher is refused, and keeps one filed elsewhere"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      const hidden = isManager ? new Set<string>() : new Set(await hiddenDocIds(this.db, workspaceId, userId, false))\n"
b = "      const hidden = new Set<string>()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-1-meili-docs-unfiltered: applied")
