# THE TAGS FACET SHOWS THE SPELLING THE DATABASE'S COLLATION SORTS FIRST, AS `min(t)` DID
# (`found-30-sep/template-tags-spelled-by-collation`).
#
# The spellings come back sorted as the collation sorts them and the first is
# kept: "Client" and "Q3" under C.UTF-8 (the lanes), "client" and "q3" under
# en_US (CI). Either way one word is shown in a spelling fewer of its
# templates carry.
#
# Reddens: template-center: "and shows each word in the spelling most of its templates carry — client, Q3, Retro — which neither collation sorts first for every word: C puts Client first, en-US q3 (asked with an explicit COLLATE)"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a1 = "        order by s.word`),\n"
b1 = "        order by s.word, s.spelling`),\n"
a2 = "    if (!held || beats(r, held)) chosen.set(r.word, r)\n"
b2 = "    if (!held) chosen.set(r.word, r) // BROKEN: the first spelling the collation sorts\n"
s = io.open(p, encoding='utf-8').read()
for a in (a1, a2):
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a1, b1).replace(a2, b2))
print('template-center-34-tags-spelled-by-collation: each tag is shown in the spelling the collation sorts first')
