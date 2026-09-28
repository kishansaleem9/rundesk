# THE PROJECT'S CLIENT PICKER IS LIVE FOR EVERYBODY, AS IT WAS: a plain member who may not change the project is offered it.
# Reddens: client-access: "the project’s client picker is live for the manager, who may change the project, and disabled — still naming its clients — for a plain member, who may not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                disabled={canEdit !== true || setClient.isPending}\n'
b = '                disabled={setClient.isPending}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cla-10-picker-for-everyone: the picker ignores the project's edit rule")
