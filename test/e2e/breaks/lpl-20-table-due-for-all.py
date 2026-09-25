# THE TABLE'S DUE DATE CELL IS OFFERED TO EVERYBODY.
# Reddens: list-page-levels: "the Table view offers a view-only reader no add row and no cell to change — status, priority, assignees, due date, a field and the name read, not pressed — a comment-only one the status of the task assigned to them, and where the default is Edit every cell, a status cell saving a new status"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                        disabled={!caps.edit}\n                        data-testid="list-table-due-button"\n'
b = '                        disabled={false}\n                        data-testid="list-table-due-button"\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-20-table-due-for-all: the table's due date cell is offered to everybody")
