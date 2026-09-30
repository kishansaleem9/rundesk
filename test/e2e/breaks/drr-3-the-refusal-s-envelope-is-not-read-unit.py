# A REFUSAL'S ENVELOPE IS NOT READ (`found-30-sep/download-refusals-say-no-reason`): a refused download is
# "Download failed (<status>)" whatever the server sent, so its words — and its details, a 429's wait among them —
# never reach the page.
# Reddens: unit: download-file.test.ts "a refused download carries the refusal’s own words, and a 4xx shows them to its reader"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "  const said = typeof error?.message === 'string' && error.message.trim() !== ''\n"
b = "  const said = false as boolean\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('drr-3-the-refusal-s-envelope-is-not-read-unit: downloadRefused ignores the envelope')
