# Coalescing removed, so every save leaves its own row and a description edited
# five times in a minute has five entries. Nothing fails; the history simply
# becomes a list nobody scrolls, which is how the feature stops being used
# without ever breaking.
#
# The comparison is made never-true rather than written `false && …`, because
# that form has cost this audit three break patches: TypeScript narrows it and
# the downstream comparisons stop compiling.
#
# Reddens: task-menu: "three quick edits by the same person stay one entry"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (latest && latest.editorId === editorId && withinWindow) return\n'
b = "    if (latest && latest.editorId === '\\u0000never' && withinWindow) return\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: revisions no longer coalesce, so every save leaves a row.')
