# A GUEST MAKES A LINK OF THEIR CLIP THAT OPENS FOR ANYBODY AGAIN
# (`found-30-sep/guests-may-ask-for-clip-links`): by the link route and by a
# public share, and the library offers them Share.
# Reddens: clip-library-access: "a guest may not link, share or copy onto a task somebody else’s clip — refused, saying which clips are theirs, and nothing is made; their own they attach, and its public link is refused as a guest’s (section 11)"
#          clip-library-access: "a clip stored before clips carried their recorder’s id is its recorder’s by their address — listed with Delete, found and deleted by them, its link refused them only as a guest’s public one — and nobody else’s"
#          clip-library-access: "a guest makes no link that opens for anybody, even of their own clip — refused 403 “Guests cannot share clips publicly”, the library and the page offering them no Share where a member is offered it — and where the workspace’s links open for members only, theirs is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = "  return !(reader.role === 'guest' && audience === 'anyone')\n"
b = "  return !(reader.role === 'guest' && audience === 'anyone' && audience !== 'anyone')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-32-a-guest-links-their-clip-for-anybody: a guest\'s public link is made')
