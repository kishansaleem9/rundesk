# A WORKSPACE'S GUEST ASKS ITS KNOWLEDGE BASE: the named-workspace guard lets guests through.
# Reddens: time-tracking-readers: "a guest of the workspace neither asks its knowledge base nor reindexes it, a member does not reindex it (403 each, nothing indexed) — and its admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/named-workspace-member.guard.ts'
a = "    if (member.role === 'guest') throw new ForbiddenException('Guests cannot use this feature')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ttr-5-knowledge-lets-workspace-guests: the guard lets a workspace's guests in")
