# THE GOAL'S PAGE READS NO HISTORY AGAIN.
# Reddens: routes-with-readers: "the goal’s History lists each change of its value, newest first — 3 → 7, then 0 → 3 — with who made it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-goal-detail-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        `/goals/${goalId}/history`,\n      ),\n  })\n'
b = '        `/goals/${goalId}/history`,\n      ),\n    enabled: Boolean(0),\n  })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rwr-3-no-goal-history: the history is never asked')
