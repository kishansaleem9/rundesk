# THE DEFINE RULE TAKES THE LIST AS IT WAS SENT (`found-30-sep/field-definition-takes-a-foreign-list`): a list of another project is put in
# `within`, so a share on it decides, and a member refused fields in a view-only space gets past the space by naming such a list.
# Reddens: field-writes-by-level: "a member refused fields in a view-only space is refused one there with no list (403), and naming a list of another space shared with them to edit (403) — no step on the way to this project — the space’s reason both times, none made (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = "  const ownList = listId != null && (await listOfProject(db, projectId, listId)) ? listId : null\n"
b = "  const ownList = listId ?? null // BROKEN: any list, as it was sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fdl-1-the-rule-takes-any-list: the define rule takes a list of another project as a step on the way")
