# THE SHEET OFFERS NO WAY OUT OF A LIST.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "its × takes it out of the team list: the row is gone (read by SQL), the activity says so, the sheet no longer names the list — and Max’s way to it goes with it"
#   or "each refusal in words: out of its home list (403), into it again (400), into a list twice (409), out of one it is not in (404), and a subtask on its own (400)"
#
# Re-aimed 12 October: the last 1 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# The lists row draws no ×.
import io
p = '/home/user/rundesk/apps/web/src/components/task-lists-row.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          {!l.home && data.canChange && (\n',
     '          {!l.home && data.canChange && !data.canChange && (\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-w4-no-way-out-of-a-list: THE SHEET OFFERS NO WAY OUT OF A LIST.')
