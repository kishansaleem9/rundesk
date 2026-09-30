# A TAG PAST FORTY CHARACTERS IS DROPPED IN SILENCE (`ledger-rows/row-1874`).
#
# The write answers 200 with the tags that fit, and the long one is simply not
# there: nothing tells its saver it was refused.
#
# Reddens: template-center: "a tag of forty-one characters is refused in words, saying the bound and its length, and nothing is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = ("      throw new BadRequestException(\n"
     "        `A tag can be at most ${TEMPLATE_TAG_MAX_LENGTH} characters, and \"${chars.slice(0, 24).join('')}…\" has ${chars.length}`,\n"
     "      )\n")
b = "      continue // BROKEN: a long tag is dropped\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-32-long-tag-dropped: a tag longer than forty characters is dropped')
