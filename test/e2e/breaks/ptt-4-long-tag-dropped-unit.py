# A TAG PAST FORTY CHARACTERS IS DROPPED IN SILENCE, asked of the normaliser itself (`ledger-rows/row-1874`).
# Reddens: unit: project-templates.service.test.ts "refuses a tag longer than forty characters, saying the bound and its length, rather than cutting it"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = ("      throw new BadRequestException(\n"
     "        `A tag can be at most ${TEMPLATE_TAG_MAX_LENGTH} characters, and \"${chars.slice(0, 24).join('')}…\" has ${chars.length}`,\n"
     "      )\n")
b = "      continue // BROKEN: a long tag is dropped\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-4-long-tag-dropped-unit: a tag longer than forty characters is dropped')
