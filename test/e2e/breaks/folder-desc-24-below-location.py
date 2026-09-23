# THE RIGHT FIELD IN THE WRONG PLACE. The frame stacks Name, Description,
# Select a Location; this moves the box below the location picker and the
# private toggle. Every other check about it still passes — which is the point:
# a screenshot of this dialog and a screenshot of the frame are different
# dialogs, and nothing but position says so.
# Reddens: folder-dialog: "it is drawn between Name and Select a Location"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()

head = '      {/*\n        Frame `08:25` — Description, BETWEEN Name'
tail = '      <Select data-testid="quick-create-folder-space"'
assert s.count(head) == 1, f'description block head appears {s.count(head)} times, expected exactly 1'
assert s.count(tail) == 1, f'location picker appears {s.count(tail)} times, expected exactly 1'
start, end = s.index(head), s.index(tail)
block = s[start:end]
assert block.count('quick-create-folder-description') == 1, 'the description block is not what it was'

# The Settings box's own comment, which is unique to the Folder tab. The
# obvious anchor — the footer `<div className="flex justify-end gap-2 pt-1">`
# — appears TEN times in this file, once per tab, and the first draft of this
# patch moved a different form's fields and would have reddened nothing it
# names. A dry run caught it; the two-hour lane run would have caught it later.
anchor = '      {/*\n        Frame `08:32` — **Settings** over a **Statuses** row'
rest = s[:start] + s[end:]
assert rest.count(anchor) == 1, f'settings anchor appears {rest.count(anchor)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(rest.replace(anchor, block + anchor))
print('quick-create-modal.tsx: Description now sits below Select a Location and the private toggle.')
