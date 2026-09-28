# THE AUTHOR FALLS BACK TO THE WORKSPACE'S OWNER, OR ITS FIRST MEMBER, AS IT DID.
# Reddens: mail-comments-by-level: "mail from somebody outside the workspace lands no comment, and nobody is put down as its author — the refusal is recorded"
#   or "mail from somebody the app refuses lands nothing — a member in a view-only space, a guest with nothing shared — while a guest with the task shared to comment comments by mail as in the app"
#   or "a reply to a notification is held to the same rule: the view-only member’s lands nothing, the admin’s lands as theirs"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const authorId = await this.memberWhoMayComment(ctx.taskId, payload.fromAddress)\n'
b = '    const authorId = await this.resolveAuthorId(ctx.listId, payload.fromAddress, null)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("mcl-3-strangers-put-down-as-members: the author falls back to the workspace's owner, or its first member, as it did")
