# The workspace rebuild only adds: it never clears the workspace's documents first.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# The state `reindexWorkspace`'s own comment records — "reindex could not do the
# one thing the word promises" — so a document for a task archived behind the
# API's back survives the only tool for repairing it. The rebuild is the one
# caller of `deleteDocuments({ filter })` and `waitForTask`, so this is also
# the one place those two are measured through the product.
#
# Reddens: search-index: "the workspace’s rebuild makes its index match it — every live task, file and doc, nothing archived or in the Trash (one archived behind the API’s back included), the count it answers, and no other workspace touched, where Meilisearch answers; where none does, it answers without claiming to have indexed anything"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = """    await this.index
      .deleteDocuments({ filter: `workspaceId = "${workspaceId}"` })
      .then((task) => this.index?.waitForTask(task.taskUid, { timeOutMs: 60_000 }))
      .catch(() => undefined)
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: the rebuild adds without clearing.')
