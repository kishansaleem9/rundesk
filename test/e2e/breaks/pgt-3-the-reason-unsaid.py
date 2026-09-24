# A CALENDAR THE SERVER CANNOT CONNECT IS GREYED OUT WITH NOTHING SAYING WHY.
# Reddens: planner-gates: "a calendar the server cannot connect is not offered as a button that works, and the page says why"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "          {(canConnect('gcal') === false || canConnect('outlook') === false) && (\n"
b = '          {false && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgt-3-the-reason-unsaid: applied")
