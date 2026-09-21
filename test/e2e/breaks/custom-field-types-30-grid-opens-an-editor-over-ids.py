# The grid offers an inline text box over a list of task ids. Typing in it sends a
# string the API answers 400, into a promise nobody reads.
# Reddens: custom-field-types: "a tasks column draws a read-only cell and nothing that opens an editor"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "const INLINE_EDITABLE_TYPES: ReadonlySet<string> = new Set([\n  'text', 'long_text', 'location', 'url', 'email', 'phone',\n  'number', 'money', 'date', 'checkbox', 'dropdown', 'tshirt_size',\n])\n"
b = "const INLINE_EDITABLE_TYPES: ReadonlySet<string> = new Set([\n  'text', 'long_text', 'location', 'url', 'email', 'phone',\n  'number', 'money', 'date', 'checkbox', 'dropdown', 'tshirt_size', 'tasks',\n])\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the grid opens an editor over a tasks field again.')
