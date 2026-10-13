# A JIRA DROPDOWN FIELD HOLDS ONLY THE FIRST ISSUE’S VALUE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "its custom fields become fields of the List — a number, a dropdown holding every value the issues have — and every comment comes in, the ones past the first read from the issue’s own route; its attachment through Atlassian’s redirect to the file; every page of issues read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/jira.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      else if (t === 'option' && v?.value) fields.push({ name: meta.name, type: 'dropdown', value: String(v.value), options: [...(optionsOf.get(meta.id) ?? [])] })\n",
     "      else if (t === 'option' && v?.value) fields.push({ name: meta.name, type: 'dropdown', value: String(v.value), options: [String(v.value)] })\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-34-dropdown-of-one: A JIRA DROPDOWN FIELD HOLDS ONLY THE FIRST ISSUE’S VALUE.')
