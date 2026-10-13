# A MEMBER'S OWN ROW OFFERS NO CONTROL: only holders of the key are offered it.
# Reddens: own-capacity: "the plain member’s Workload offers a capacity control on their own row and on nobody else’s, and setting 32 hours through it saves them"
import io
# Re-aimed with `ledger-rows/row-777`: the rule moved to the one module the page and a list's Workload view share.
p = '/home/user/rundesk/apps/web/src/components/workload-parts.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  return (userId?: string) => Boolean(userId) && ((userId === me?.id && myRole !== 'guest') || mayManageProfiles)\n"
b = "  return (userId?: string) => Boolean(userId) && ((userId === me?.id && myRole !== 'guest' && Boolean(0)) || mayManageProfiles)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ocp-6-own-row-not-offered: the own row is not offered')
