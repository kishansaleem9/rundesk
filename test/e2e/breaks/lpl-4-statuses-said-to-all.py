# THE LIST ANSWERS "STATUSES" WITHOUT ASKING THE STATUS RULE.
# Reddens: list-page-levels: "the API says what the list’s routes would: nothing in the view-only space, comments in the comment-only one, changes, statuses and fields where the default is Edit, and adding too where it is Full edit"
#   or "in a view-only space the list page offers the member nothing to change: no Add task, no add row, no done circle — a subtask’s neither — priority, due date or selection on a row, no Statuses and no Create field"
#   or "the Board view gives a view-only reader no add row, no Add group, no column to rename and no card to drag to another status, and gives them all where the default is Full edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowed(assertMayShapeStatuses(this.db, { owner: 'list', ownerId: listId, actorId: actor.id })),\n"
b = '      Promise.resolve(true),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lpl-4-statuses-said-to-all: the list answers "statuses" without asking the status rule')
