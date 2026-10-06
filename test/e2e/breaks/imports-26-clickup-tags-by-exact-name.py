# THE CLICKUP IMPORT FINDS A TAG BY ITS EXACT SPELLING (`found-30-sep/spreadsheet-import-skips-task-rules`).
# Reddens: imports: "a ClickUp row tagged in another case is tagged with the workspace’s tag — no second tag differing only in case"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    sql`lower(${labels.name}) in (lower(${full}), lower(${stored}))`,\n"
b = "    eq(labels.name, full),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-26-clickup-tags-by-exact-name: the ClickUp import matches a tag by exact case")
