# A task made is never written into the search index: `createTask` skips `indexTaskInSearch`.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# On that path a plain search reads tasks from the index and from nowhere else,
# so a task nobody indexed is a task nobody can find by searching — while the
# list, the board and GET /tasks/:id all show it. The stub's record says why.
# The two deletion checks start from tasks made the same way and found first,
# so they redden too: a task that was never found proves nothing by going.
#
# Reddens: search-index: "a task made is in what this lane searches — indexed under its title, its description and its place (workspace, space, list) where Meilisearch answers; in the tasks table the database search reads where it does not"
#          search-index: "and the search endpoint finds it by its title — through the index, with its workspace’s filter, where Meilisearch answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """    this.realtime.emitToList(data.listId, { type: 'task.created', listId: data.listId, task: hydrated })
    void this.indexTaskInSearch(task.id)
"""
b = """    this.realtime.emitToList(data.listId, { type: 'task.created', listId: data.listId, task: hydrated })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a task made is not indexed.')
