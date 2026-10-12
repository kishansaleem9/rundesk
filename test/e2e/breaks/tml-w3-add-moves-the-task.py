# ADD TO › ANOTHER LIST MOVES THE TASK.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "Add to › Another List opens the picker without the task’s own list; the list chosen holds the task (read by SQL), its activity says so, the sheet names both lists, the home one marked, and the picker offers that list no more"
#   or "whoever may open one of its lists reads it there: Max, refused it before, reads it by id and in the team list after — its home still Mia’s list, which is not named to him"
#   or "it is one task: Mia renames it in her list and the team list reads the new name, one row of it (read by SQL) — and Max, who may change nothing in Mia’s list, may not change it from his"
#   or "the team list draws the task with a chip saying it lives elsewhere — the list unnamed to Max — in a group of its home list’s status, named as at home, which the team list does not have, offering no + Add Task there"
#   or "and the Board draws a column for that status, the task on it"
#   or "its × takes it out of the team list: the row is gone (read by SQL), the activity says so, the sheet no longer names the list — and Max’s way to it goes with it"
#   or "each refusal in words: out of its home list (403), into it again (400), into a list twice (409), out of one it is not in (404), and a subtask on its own (400)"
#   or "moved into a list it was added to, that list is its home, and it is not in it twice (read by SQL)"
#
# Re-aimed 12 October: the last 7 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# The picker in add mode sends the move.
import io
p = '/home/user/rundesk/apps/web/src/components/move-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (kind === 'task' && mode === 'add') {\n",
     "      if (kind === 'task' && mode === 'add' && !kind) {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w3-add-moves-the-task: ADD TO › ANOTHER LIST MOVES THE TASK.')
