# AN EARLIER FILE'S READ LANDS AFTER A REFUSAL (`found-5-oct/xlsx-read-as-text`): a file still being read, replaced by one the page
# refuses, is read into the page anyway, so the page says "refused", draws no file line, and offers Preview of the first.
# Reddens: imports: "a file still being read when a refused one replaces it is not offered: no file line, no Preview, no preview request"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      if (pickTurns.isLatest(turn)) setContent(typeof reader.result === 'string' ? reader.result : '')\n"
b = "      setContent(typeof reader.result === 'string' ? reader.result : '')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-37-a-slow-read-lands-after-a-refusal: every read lands, the superseded ones included')
