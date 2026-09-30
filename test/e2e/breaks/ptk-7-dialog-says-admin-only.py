# THE TEMPLATE CENTER'S SAVE DIALOG SAYS "(admin only)" AGAIN
# (`found-30-sep/template-save-dialog-says-admin-only`), to the member granted
# `template.manage` who is reading it and may save.
#
# Reddens: project-template-key: "the save dialog tells the member granted template.manage who may save — anyone with the “Manage templates” permission — and not that saving is for admins only"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'templates.saveDescription': 'Snapshot an existing project’s lists and tasks into a reusable template. Anyone with the “{{permission}}” permission can save one; managers and admins have it by default.',\n"
b = "  'templates.saveDescription': 'Snapshot an existing project’s lists and tasks into a reusable template (admin only).',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptk-7-dialog-says-admin-only: the save dialog says admin only')
