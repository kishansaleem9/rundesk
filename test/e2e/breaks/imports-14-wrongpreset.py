# Check 14 — record every run as the generic preset, so the job cannot say which
# of the frame's named tools it actually read. (Also fails check 18's badge.)
#
# Reddens: imports: "\\n▶ …and records WHICH importer ran, and under which preset"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        sourcePreset: source.key,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "        sourcePreset: 'generic',"))
print('BROKE check 14: every run is recorded as the generic preset')
