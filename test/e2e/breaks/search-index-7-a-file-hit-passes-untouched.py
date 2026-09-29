# The index's file hits pass through untouched, as they did: a member refused a
# private space finds, by name, the file on its task
# (found-29-sep/meili-file-hits-skip-the-read-rule), and a file whose task was
# archived or put in the Trash is found.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# Reddens: search-index: "a member refused a private space does not find the file on its task by name, while the admin does — the member’s search through the index where Meilisearch answers"
#          search-index: "a file goes where its task goes — found before, and not found once its task is archived or in the Trash, whichever engine answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "    const fileHits = hits.filter((h) => h.entityType === 'file')\n    if (fileHits.length > 0) {\n"
b = "    const fileHits = hits.filter((h) => h.entityType === 'file')\n    if (fileHits.length > 0 && false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: the index’s file hits pass through untouched.')
