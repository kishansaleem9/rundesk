# The picker stops reading the shared filter state and keeps its own idea of
# what is selected, so the faces and the select disagree about what is on
# screen — the exact bug the one-state design exists to make impossible.
# Reddens: list-assignee-filter: "the chosen face sits beside the chip with the frame’s ✕ on it"
#   or "and choosing in the select moves the picker too"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const current = selected.length === 1 ? selected[0] : ''"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "  const current = selected.length === 2 ? selected[0] : ''"))
print('[break 12] The picker no longer reflects the filter it writes.')
