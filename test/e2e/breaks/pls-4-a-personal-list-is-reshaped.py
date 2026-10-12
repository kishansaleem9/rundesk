# A PERSONAL LIST IS RENAMED, MOVED AND DELETED LIKE ANY LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "nobody renames, moves or deletes it: Mia is refused each in words (403), the owner is refused too, its menus are told so, and it is as it was (read by SQL)"
#   or "and nothing but tasks is made in its place — a list, a folder, a doc each refused in words (403), and no form files into it (400) — and the owner does not rename the space it lives in (read by SQL)"
#   or "the Move picker offers her her own Personal List — and Max not hers — and the shared task moved into it takes its sharing: Max read it before, and is refused it after"
#   or "deleted, it is in her Trash, where it is named “Personal List” — and not in the owner’s, who cannot find it there to delete it for good (404)"
#   or "Home’s Personal List draws her tasks — the old to-dos and the task moved in — and the sidebar draws the workspace’s space and no personal one"
#   or "a row opens its task, in her Personal List, as any task opens"
#   or "“Open as a list” opens her Personal List as a list, her tasks in it"
#   or "a to-do added on Home is a task of her Personal List, and ticking it closes the task (read by SQL)"
#
# Re-aimed 9 October: the last 7 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Its owner renames it, moves it into a project of the hierarchy, and deletes it.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (params.spaceId && (await isPersonalSpace(db, params.spaceId))) throw new ForbiddenException(PERSONAL_PLACE_REFUSAL)\n',
     '  if (params.spaceId && false) throw new ForbiddenException(PERSONAL_PLACE_REFUSAL) // BROKEN: anybody reshapes it\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-4-a-personal-list-is-reshaped: A PERSONAL LIST IS RENAMED, MOVED AND DELETED LIKE ANY LIST.')
