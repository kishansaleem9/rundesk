# THE IMPORTER AS IT WAS: any spaceId.
# Reddens: doc-boundaries: "and the importer obeys the same rule"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    const { title, content } = splitTitleFromMarkdown(raw, opts.fileName ?? '')\n    if (opts.spaceId) await this.assertDocSpace(opts.spaceId, workspaceId, userId)\n"
b = "    const { title, content } = splitTitleFromMarkdown(raw, opts.fileName ?? '')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-5-import-skips-space-rule: applied")
