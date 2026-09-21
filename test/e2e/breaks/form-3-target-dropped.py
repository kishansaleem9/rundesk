# Create the form with its title and drop the destination — the mirror defect.
# The row exists, the Forms list looks identical, and every submission it ever
# takes produces nothing because createTaskForSubmission returns early.
# Reddens: space-create-menu: "a form created through the menu exists and files into the list it was given"
import io
p = "/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx"
a = "        body: JSON.stringify({ title: title.trim(), targetListId }),"
b = "        body: JSON.stringify({ title: title.trim() }),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the form is created with no destination.')
