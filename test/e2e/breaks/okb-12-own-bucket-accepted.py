# A URL OF OUR OWN BUCKET TREATED AS A PASTED LINK: a key, spelled as a URL, stored.
# Reddens: object-key-boundaries: "and a URL of this deployment’s own bucket naming any other object is refused — a key spelled as a link"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '      throw new BadRequestException("That link points into this workspace\'s own storage; a recording there belongs to the call that made it")\n'
b = '      return value\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-12-own-bucket-accepted: applied")
