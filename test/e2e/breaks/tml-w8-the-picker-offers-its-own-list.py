# THE PICKER OFFERS THE TASK’S OWN LIST.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "Add to › Another List opens the picker without the task’s own list; the list chosen holds the task (read by SQL), its activity says so, the sheet names both lists, the home one marked, and the picker offers that list no more"
#
# Add to › Another List offers the list the task is in already.
import io
p = '/home/user/rundesk/apps/web/src/components/move-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (mode !== 'add' || !excludeListIds?.length) return out\n",
     "      if (mode !== 'add' || !excludeListIds?.length || mode === 'add') return out // BROKEN\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w8-the-picker-offers-its-own-list: THE PICKER OFFERS THE TASK’S OWN LIST.')
