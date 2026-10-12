# THE BOARD'S ADD ROW IS OFFERED TO EVERYBODY.
# Reddens: list-page-levels: "the Board view gives a view-only reader no add row, no Add group, no column to rename and no card to drag to another status, and gives them all where the default is Full edit"
#
# Re-aimed 12 October: the add row also hides where a list shows only the tasks
# added to it (Tasks in Multiple Lists); the level check goes, that one stays. Same break.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          {caps.add && !homeOnly && (\n          <form\n            className="p-2 pt-0"\n'
b = '          {true && !homeOnly && (\n          <form\n            className="p-2 pt-0"\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("lpl-25-board-add-for-all: the board's add row is offered to everybody")
