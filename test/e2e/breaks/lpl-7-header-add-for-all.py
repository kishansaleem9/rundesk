# THE HEADER OFFERS ADD TASK TO EVERYBODY.
# Reddens: list-page-levels: "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "where the default is Edit the rows are theirs to change — a new priority saves — with Statuses and Create field, and there is no Add task or add row, since adding takes Full edit"
#   or "in a comment-only space the member may complete the task assigned to them — and completing it saves — and nothing else: no done circle on the other, no priority, no Add task"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        quickAdd={\n          listAccess.add ? (\n'
b = '        quickAdd={\n          true ? (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-7-header-add-for-all: the header offers add task to everybody')
