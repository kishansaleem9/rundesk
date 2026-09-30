# THE TOAST SAYS "LINK COPIED" AND NOTHING ELSE, AS IT DID (`resume-defects/resume-7`).
#
# The frame's own words, and only those: nobody is told who can open the link
# or that it does not expire. The ledger item's second half — "and nothing
# tells the person" — is back, with the link itself still right.
#
# Reddens: clip-links: "and the toast says who can open it and that it does not expire"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = ("      toast.success(t('clipCreated.linkCopied'), {\n"
     "        description: t(linkAudienceRef.current === 'members' ? 'clipLink.members' : 'clipLink.anyone'),\n"
     "      })\n")
b = "      toast.success(t('clipCreated.linkCopied'))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-12-the-toast-says-only-copied: the toast says nothing of who can open the link')
