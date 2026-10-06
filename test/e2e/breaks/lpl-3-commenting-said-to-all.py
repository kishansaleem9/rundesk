# THE LIST ANSWERS "COMMENT" TO EVERYBODY WHO CAN OPEN IT.
# Reddens: list-page-levels: "the API says what the list’s routes would: nothing in the view-only space, comments in the comment-only one, changes, statuses and fields where the default is Edit, and adding too where it is Full edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return { add, edit: spaceLevelReaches(level, 'edit'), comment: spaceLevelReaches(level, 'comment'), statuses, fields, views:"
b = "    return { add, edit: spaceLevelReaches(level, 'edit'), comment: true, statuses, fields, views:"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-3-commenting-said-to-all: the list answers "comment" to everybody who can open it')
