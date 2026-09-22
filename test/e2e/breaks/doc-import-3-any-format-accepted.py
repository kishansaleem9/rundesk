# Every extension is accepted, so a .docx becomes a doc full of binary.
#
# `attachment-text.ts` already recorded that PDF, Word, Excel and PowerPoint
# are "intentionally NOT parsed" because they "would require a heavy parser
# dependency". Accepting one here does not import it — it writes the raw bytes
# into a Doc and calls that success, which is the facade at document scale and
# exactly what this page's header refuses for the ten named tools.
#
# PREDICTED TWO. With nothing refused there is no error line at all, so both
# the refusal check and the one about its wording go red together — they are
# two claims about one sentence and the second cannot survive the first.
#
# Reddens: doc-import: "a format it cannot read is refused out loud"
#          doc-import: "and the refusal names the formats that DO work, rather than only saying no"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.controller.ts'
a = "    if (name && !/\\.(md|markdown|txt)$/i.test(name)) {"
b = "    if (false) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs.controller.ts: any extension is imported as markdown.')
