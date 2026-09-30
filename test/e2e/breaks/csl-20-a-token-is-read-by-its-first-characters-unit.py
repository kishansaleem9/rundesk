# A TOKEN'S SHAPE IS CHECKED ON ITS FIRST 32 CHARACTERS ONLY (`resume-defects/resume-7`).
#
# Anything longer is taken to the database: `<token>/..` and every string with a
# well-formed head is looked up, where the route refused it before reading
# anything. Nothing is found, so nothing plays; the database is asked what no
# token could be.
#
# Reddens: unit: clips.service.test.ts "a token that is not one, a token nobody holds and a clip that is gone are not found, and nothing is signed"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw new NotFoundException('Clip not found')\n"
b = "    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token.slice(0, 32))) throw new NotFoundException('Clip not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-20-a-token-is-read-by-its-first-characters-unit: a malformed token is looked up')
