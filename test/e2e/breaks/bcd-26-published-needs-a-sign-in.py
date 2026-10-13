# A published deck’s link asks for a sign-in.
# Reddens: brain-comments-and-decks: "published, its link opens the deck for somebody signed in to nothing — its title and its slides, paged"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.controller.ts'
a = '@Controller()\n@UseGuards(RateLimitGuard)\nexport class ArtifactsPublicController {'
b = '@Controller()\n@UseGuards(JwtAuthGuard, RateLimitGuard)\nexport class ArtifactsPublicController {'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-26-published-needs-a-sign-in: A published deck’s link asks for a sign-in.')
