# THE TAGS FACET'S SPELLING IS CHOSEN WITHOUT ASKING HOW MANY TEMPLATES CARRY IT
# (`found-30-sep/template-tags-spelled-by-collation`).
# Reddens: unit: project-templates.service.test.ts "shows a word in the spelling most of its templates carry, not the one a collation sorts first"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    a.uses !== b.uses ? a.uses > b.uses\n"
b = "    false ? a.uses > b.uses // BROKEN: how many carry it is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-17-tag-spelled-without-counting-unit: the spelling is chosen by when it was written alone')
