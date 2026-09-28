# THE MAIL PATH'S COMMENT RULE ASKS NO LEVEL.
# Reddens: mail-comments-by-level: "mail from somebody the app refuses lands nothing — a member in a view-only space, a guest with nothing shared — while a guest with the task shared to comment comments by mail as in the app"
#   or "a reply to a notification is held to the same rule: the view-only member’s lands nothing, the admin’s lands as theirs"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "  return !resolved || spaceLevelReaches(resolved.level, 'comment')\n}\n"
b = "  return !resolved || spaceLevelReaches(resolved.level, 'view')\n}\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("mcl-4-mail-asks-no-level: the mail path's comment rule asks no level")
