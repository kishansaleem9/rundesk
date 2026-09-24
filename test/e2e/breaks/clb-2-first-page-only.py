# THE LISTING READS ITS FIRST PAGE ONLY, whatever the store says is left: the
# 1001st clip is on the second page, so neither reader sees it.
# Reddens: clip-library: "with ${CLIPS} clips, the library lists the newest ${LISTED}, the newest first — not the oldest"
#   or "search finds the newest clip by its name"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '      const next = page.IsTruncated ? page.NextContinuationToken : undefined\n'
b = '      const next = undefined as string | undefined\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clb-2-first-page-only: the listing stops after one page')
