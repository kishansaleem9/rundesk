# BETWEEN TWO SPELLINGS CARRIED AS OFTEN, THE TAGS FACET SHOWS THE ONE WRITTEN FIRST
# (`found-30-sep/template-tags-spelled-by-collation`).
#
# The rule's second step turned round: "Retro", on a template since the run
# began, is shown over "retro", written a moment ago, so a word re-spelled
# stays in its old spelling until the new one outnumbers it.
#
# Reddens: template-center: "and a word carried as often in two spellings is shown in the one written last — retro, just written, over Retro"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    : time(a.newest) !== time(b.newest) ? time(a.newest) > time(b.newest)\n"
b = "    : time(a.newest) !== time(b.newest) ? time(a.newest) < time(b.newest) // BROKEN: the first written wins\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-35-tie-goes-to-the-first-written: a tie goes to the spelling written first')
