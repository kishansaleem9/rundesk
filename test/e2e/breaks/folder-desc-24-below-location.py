# THE RIGHT FIELD IN THE WRONG PLACE. The frame stacks Name, Description,
# Select a Location; this drops the box under the location picker, past the
# private toggle. Every other check about it still passes — which is the point:
# a screenshot of this dialog and a screenshot of the frame are different
# dialogs, and nothing but position says so.
# Reddens: folder-dialog: "it is drawn between Name and Select a Location"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
start = s.index('      {/*\n        Frame `08:25` — Description, BETWEEN Name')
end = s.index('      <Select data-testid="quick-create-folder-space"')
block = s[start:end]
assert block.count('quick-create-folder-description') == 1, 'the description block moved'
rest = s[:start] + s[end:]
anchor = '      <div className="flex justify-end gap-2 pt-1">'
assert rest.count(anchor) == 1, f'footer anchor appears {rest.count(anchor)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(rest.replace(anchor, block + anchor))
print('quick-create-modal.tsx: Description now sits below Select a Location and the toggles.')
