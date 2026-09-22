# Check 3 — make the preset a recoloured button. autoMap ignores which source it
# was given, so every preset produces the generic mapping and picking 'Jira
# Software' changes nothing but the highlight. (Cascades: the Jira file then has
# no Title column, so the later checks go with it — check 3 is the gate.)
#
# Reddens: imports: "a hand-edited mapping is what the server is actually asked to use"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = '  const source = sourceByKey(sourceKey)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "  const source = sourceByKey('generic')"))
print('BROKE check 3: every preset now maps like the generic one')
