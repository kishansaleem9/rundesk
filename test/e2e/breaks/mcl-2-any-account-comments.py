# MAIL FROM ANY ACCOUNT BECOMES ITS COMMENT, WHATEVER THE COMMENT RULE SAYS.
# Reddens: mail-comments-by-level: "mail from somebody the app refuses lands nothing — a member in a view-only space, a guest with nothing shared — while a guest with the task shared to comment comments by mail as in the app"
#   or "mail from somebody outside the workspace lands no comment, and nobody is put down as its author — the refusal is recorded"
#   or "a reply to a notification is held to the same rule: the view-only member’s lands nothing, the admin’s lands as theirs"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return (await taskCommentAllowed(this.db, taskId, byEmail.id)) ? byEmail.id : null\n'
b = '    return byEmail.id\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcl-2-any-account-comments: mail from any account becomes its comment, whatever the comment rule says')
