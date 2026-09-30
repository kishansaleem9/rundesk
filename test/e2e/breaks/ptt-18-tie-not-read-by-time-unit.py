# BETWEEN TWO SPELLINGS CARRIED AS OFTEN, WHEN EACH WAS WRITTEN IS NOT ASKED
# (`found-30-sep/template-tags-spelled-by-collation`): the tie goes straight to character code.
# Reddens: unit: project-templates.service.test.ts "between spellings carried as often, shows the one written last"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    : time(a.newest) !== time(b.newest) ? time(a.newest) > time(b.newest)\n"
b = "    : false ? time(a.newest) > time(b.newest) // BROKEN: when it was written is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-18-tie-not-read-by-time-unit: a tie goes to the first by character code')
