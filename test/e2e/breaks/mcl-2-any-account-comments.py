# MAIL FROM ANY ACCOUNT BECOMES ITS COMMENT, WHATEVER THE COMMENT RULE SAYS.
# Reddens: mail-comments-by-level: ", ) // ══ 4. WHO THE APP REFUSES ═══════════════════════════════════════════════ console.log('\\n▶ a member in the view-only space; a guest with nothing shared; a guest with the task shared to comment') const v1 = await mail({ from: member.email, to: VIEW.reply, text: 'from the view-only member' }) const g1 = await mail({ from: guest.email, to: OPEN.reply, text: 'from the guest with nothing shared' }) const g2 = await mail({ from: sharedGuest.email, to: OPEN.reply, text: 'from the guest it is shared with' }) chk( v1.outcome === 'rejected_not_allowed' && v1.author === null && g1.outcome === 'rejected_not_allowed' && g1.author === null && g2.outcome === 'comment_added' && g2.author === sharedGuest.email, 'mail from somebody the app refuses lands nothing — a member in a view-only space, a guest with nothing shared — while a guest with the task shared to comment comments by mail as in the app',"
#   or ", to: OPEN.reply, text: 'from nobody at all' }) chk( s1.outcome === 'rejected_not_allowed' && s1.author === null && s1.recorded === 'rejected_not_allowed' && s2.outcome === 'rejected_not_allowed' && s2.author === null, 'mail from somebody outside the workspace lands no comment, and nobody is put down as its author — the refusal is recorded',"
#   or ", text: 'a reply from the admin', inReplyTo: sentId }) chk( r1.outcome === 'rejected_not_allowed' && r1.author === null && r2.outcome === 'comment_added' && r2.author === adminEmail, 'a reply to a notification is held to the same rule: the view-only member’s lands nothing, the admin’s lands as theirs',"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return (await taskCommentAllowed(this.db, taskId, byEmail.id)) ? byEmail.id : null\n'
b = '    return byEmail.id\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcl-2-any-account-comments: mail from any account becomes its comment, whatever the comment rule says')
