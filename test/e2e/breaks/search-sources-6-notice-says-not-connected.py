# THE NOTICE SAYS "NOT CONNECTED" TO A MEMBER WHOSE ADMIN CONNECTED IT — true of nobody, and no reason given.
# Reddens: search-sources: "a member choosing Gmail is told it is somebody else’s account — and offered no Connect that would replace it"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = "<span>{t(activeSource.heldBy === 'someone-else' ? 'palette.sourceSomeoneElses' : 'palette.sourceNotConnected')}</span>"
b = "<span>{t('palette.sourceNotConnected')}</span>"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("search-sources-6-notice-says-not-connected: applied")
