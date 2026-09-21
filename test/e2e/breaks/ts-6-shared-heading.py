# Every column is headed with the first selected person, while the windows stay
# correct. The grid is right and the labels are wrong, which is the harder half
# to notice and the one that gets the wrong person invited.
# Reddens: team-schedules: "each column is headed with its own person, and the two headings differ"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '                {nameOf(userId)}\n              </div>\n'
b = '                {nameOf(order[0])}\n              </div>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: every column heading now names the first person.')
