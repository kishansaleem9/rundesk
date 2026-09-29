# A task put in the Trash stays in the search index: `binTask` never calls `removeTask`.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# The search endpoint still hides it — the Meilisearch half holds every task
# hit to `isArchived` in Postgres — so the check that notices is the one that
# reads the index: the document outlives its task, the index only grows, and
# binned work takes places on result pages that live work needed.
#
# Reddens: search-index: "a task put in the Trash is let go of — taken out of the index (removeTask) where Meilisearch answers, and no longer found by the search endpoint either way"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
# Anchored on binTask's own comment: archiving ends in the same call.
a = """    // search index. A task in the bin is not something anyone should find.
    void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined)
    void this.search.removeTask(taskId).catch(() => undefined)
"""
b = """    // search index. A task in the bin is not something anyone should find.
    void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a task put in the Trash stays indexed.')
