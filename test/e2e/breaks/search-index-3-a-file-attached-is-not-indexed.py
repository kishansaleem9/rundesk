# A file attached to a task is never written into the search index.
# Reddens only where Meilisearch answers: run it on a lane RUNDESK_LANE_SEARCH names.
#
# On that path a search reads files from the index alone (the attachments
# query is the Postgres path's), so an attachment nobody indexed cannot be
# found by its name, though the task lists it.
#
# Reddens: search-index: "a file attached to it is in what this lane searches — indexed under its name, its type and its task’s place where Meilisearch answers; among the task’s attachments the database search reads where it does not"
#          search-index: "and the search endpoint finds the file by its name — through the index where Meilisearch answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    void this.indexAttachmentInSearch(row, taskId)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: an attached file is not indexed.')
