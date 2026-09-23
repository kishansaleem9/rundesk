# THE FRAME'S WORDS, replaced with a house string. The placeholder is the only
# place the dialog says the field is OPTIONAL, and a box that does not say so
# reads as one more thing you must fill in before you are allowed to continue.
# Reddens: folder-dialog: "carrying the frame's own placeholder"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'quickCreate.folderDescriptionPlaceholder': 'Tell us a bit about your Folder (optional)',"
b = "  'quickCreate.folderDescriptionPlaceholder': 'Add a description',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("catalogs.ts: the placeholder no longer says the field is optional.")
