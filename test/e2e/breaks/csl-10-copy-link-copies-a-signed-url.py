# COPY LINK COPIES A SIGNED STORAGE URL AGAIN (`resume-defects/resume-7`).
#
# The defect this item closed, back by the short road: "the clip has a URL
# already", so the one the library lists — signed for fifteen minutes — is what
# goes on the clipboard, falling back to the bare path where the library does
# not have it. It pastes, it plays, and a quarter of an hour later it is dead.
#
# Reddens: clip-links: "Copy link copies the clip’s own link — /clips/<token> on this site — with no storage address and no signature in it"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-publish.ts'
a = "  return { ...made, url: `${window.location.origin}${made.path}` }\n"
b = ("  const signed = (await api<Array<{ storageKey: string; url: string }>>(`/workspaces/${workspaceId}/clips`))"
     ".find((c) => c.storageKey === storageKey)?.url\n  return { ...made, url: signed ?? made.path }\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-10-copy-link-copies-a-signed-url: the clipboard gets a URL that expires')
