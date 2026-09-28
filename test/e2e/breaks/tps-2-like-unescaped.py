# WHAT WAS TYPED IS A LIKE PATTERN: `%` and `_` match anything.
# Re-aimed 28 September: the escape is `likeContaining` now (`like-patterns-escaped-four-ways`).
# Reddens: task-pickers-search: "a % typed is a percent sign, not a wildcard"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const like = words ? likeContaining(words) : null\n'
b = '    const like = words ? `%${words}%` : null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-2-like-unescaped: applied")
