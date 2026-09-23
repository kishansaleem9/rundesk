# THE VERSION CHECK TREATED AS A COLUMN: every save from the editor, which sends
# expectedUpdatedAt, is refused as an unknown field.
# Reddens: doc-boundaries: "while an ordinary edit, with the editor’s version check, still goes through"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/doc-update-fields.ts'
a = "const CONTROLS = new Set<string>(['expectedUpdatedAt'])\n"
b = 'const CONTROLS = new Set<string>([])\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-16-version-check-refused: applied")
