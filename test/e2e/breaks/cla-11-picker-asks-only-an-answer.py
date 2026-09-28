# THE TIME SECTION TAKES ANY ANSWER FROM THE PROJECT AS LEAVE TO EDIT: a plain member's picker is live.
# Reddens: client-access: "the project’s client picker is live for the manager, who may change the project, and disabled — still naming its clients — for a plain member, who may not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = 'canEdit={caps ? caps.edit === true : null} />'
b = 'canEdit={caps ? true : null} />'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-11-picker-asks-only-an-answer: canEdit is any capabilities answer')
