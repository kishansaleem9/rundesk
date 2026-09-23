# CREATE-FROM-TEMPLATE AS IT WAS: any spaceId.
# Reddens: doc-boundaries: "and so does creating one from a template"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "Template not found in this workspace')\n    if (opts.spaceId) await this.assertDocSpace(opts.spaceId, workspaceId, userId)\n"
b = "Template not found in this workspace')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-6-template-skips-space-rule: applied")
