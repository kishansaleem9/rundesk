# A TAGS EDIT WRITES THE LIST AS SENT, NOT AS CLEANED (`ledger-rows/row-1874`).
# It is checked, and then the raw list — " Retro ", "retro" — is what the row holds.
# Reddens: unit: project-templates.service.test.ts "writes the cleaned list over the one held, and answers with the row"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "      .set({ tags, updatedAt: new Date() })\n"
b = "      .set({ tags: value as string[], updatedAt: new Date() }) // BROKEN: the raw list\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-9-edit-writes-the-raw-list-unit: an edit writes the tags as sent')
