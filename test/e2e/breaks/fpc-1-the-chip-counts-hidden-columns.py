# THE FIELDS CHIP COUNTS A HIDDEN COLUMN AS A HIDDEN FIELD, as it did (`found-30-sep/fields-picker-counts-hidden-columns`): hiding Due makes it
# read one short, and hiding every built-in column below nought.
# Reddens: custom-field-types: "the Fields chip counts the fields shown: with Due hidden, and with every built-in column hidden, it reads all of this list’s fields as shown — and hiding a field takes it one lower"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "                  {t('list.table.fields', { shown: shownFieldCount(projectFields, hiddenFields), total: projectFields.length })}\n"
b = "                  {t('list.table.fields', { shown: projectFields.length - hiddenFields.size, total: projectFields.length })}{/* BROKEN: columns counted as fields */}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fpc-1-the-chip-counts-hidden-columns: the Fields chip counts a hidden built-in column as a hidden field")
