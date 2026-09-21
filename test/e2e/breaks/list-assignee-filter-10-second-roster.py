# THE DUPLICATED-LIST PATCH. The picker builds its own roster and leaves
# somebody out of it, so the faces and the native select beside them offer
# different people — each individually plausible, which is how the
# field-type picker ended up offering ten of nineteen types.
# Reddens: "offers exactly the same people, in the same order".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    rows.push({ value: UNASSIGNED_FILTER, label: t('list.group.unassigned'), face: false })"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('[break 10] The face picker and the select now offer different rosters.')
