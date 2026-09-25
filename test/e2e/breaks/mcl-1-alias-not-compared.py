# A TASK'S ADDRESS IS READ FOR ITS ID ALONE AGAIN; THE LIST'S ALIAS IS NOT COMPARED.
# Reddens: mail-comments-by-level: "a task’s address is its list’s: its id under another list’s alias, or a made-up one, lands no comment — even from somebody who may comment on it"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (!task || !alias || alias.revokedAt || alias.localPart !== route.localPart) {\n'
b = '      if (!task) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("mcl-1-alias-not-compared: a task's address is read for its id alone again; the list's alias is not compared")
