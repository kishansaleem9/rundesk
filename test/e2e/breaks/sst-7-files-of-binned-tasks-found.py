# THE DATABASE'S FILE SEARCH SKIPS THE BIN, as it did: a file on an archived or binned task is found
# (found-29-sep/files-of-binned-tasks-found).
# Reddens: unit: search.service.test.ts "withholds the file of an archived or binned task unless archived work is asked for"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      // task and still found its file (`found-29-sep/files-of-binned-tasks-found`).\n      includeArchived ? undefined : eq(tasks.isArchived, false),\n"
b = "      // task and still found its file (`found-29-sep/files-of-binned-tasks-found`).\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sst-7-files-of-binned-tasks-found: applied")
