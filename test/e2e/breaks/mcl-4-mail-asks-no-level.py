# THE MAIL PATH'S COMMENT RULE ASKS NO LEVEL.
# Reddens: mail-comments-by-level: ", ) // ══ 4. WHO THE APP REFUSES ═══════════════════════════════════════════════ console.log('\\n▶ a member in the view-only space; a guest with nothing shared; a guest with the task shared to comment') const v1 = await mail({ from: member.email, to: VIEW.reply, text: 'from the view-only member' }) const g1 = await mail({ from: guest.email, to: OPEN.reply, text: 'from the guest with nothing shared' }) const g2 = await mail({ from: sharedGuest.email, to: OPEN.reply, text: 'from the guest it is shared with' }) chk( v1.outcome === 'rejected_not_allowed' && v1.author === null && g1.outcome === 'rejected_not_allowed' && g1.author === null && g2.outcome === 'comment_added' && g2.author === sharedGuest.email, 'mail from somebody the app refuses lands nothing — a member in a view-only space, a guest with nothing shared — while a guest with the task shared to comment comments by mail as in the app',"
#   or ", text: 'a reply from the admin', inReplyTo: sentId }) chk( r1.outcome === 'rejected_not_allowed' && r1.author === null && r2.outcome === 'comment_added' && r2.author === adminEmail, 'a reply to a notification is held to the same rule: the view-only member’s lands nothing, the admin’s lands as theirs',"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "  return !resolved || spaceLevelReaches(resolved.level, 'comment')\n}\n"
b = "  return !resolved || spaceLevelReaches(resolved.level, 'view')\n}\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("mcl-4-mail-asks-no-level: the mail path's comment rule asks no level")
