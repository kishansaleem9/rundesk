# The narrowing goes too far and takes the working editors with it: every custom
# column becomes read-only, which is not a fix, it is the feature removed.
# Reddens: custom-field-types: "while the money column in the same row is still editable in place, so this narrowed the grid rather than disabling it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "  'number', 'money', 'date', 'checkbox', 'dropdown', 'tshirt_size',\n"
b = "  'number', 'date', 'checkbox', 'dropdown', 'tshirt_size',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: money columns are no longer editable in the grid.')
