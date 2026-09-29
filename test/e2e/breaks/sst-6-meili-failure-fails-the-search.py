# A MEILISEARCH THAT FAILS FAILS THE SEARCH, as it did: only a failed init fell back
# (found-29-sep/meili-gone-after-boot-fails-every-search).
# Reddens: unit: search.service.test.ts "answers from Postgres when Meilisearch fails after boot"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = ").catch((err: unknown) => {\n        this.logger.warn(`Meilisearch search failed, answered from Postgres: ${(err as Error).message}`)\n        return null\n      })\n"
b = ")\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-6-meili-failure-fails-the-search: applied")
