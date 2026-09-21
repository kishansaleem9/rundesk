# The Google button renders, is enabled, and requests nothing. The dead-control
# defect, and it photographs exactly like a working button.
# Reddens: planner-onboarding: "pressing Google Calendar asks the server to start OAuth"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "              onClick={() => onConnect('gcal')}\n"
b = '              onClick={() => {}}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the Google connect button does nothing.')
