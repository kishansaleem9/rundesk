# A REACTION FROM ANYONE IS RELAYED to the call's channel: a removed member, an account never
# in the workspace, a member outside a DM.
# Reddens: realtime-sends-access: "a reaction in a DM’s SyncUp is heard from the other person in it, and not from a member outside the DM, a member removed from the workspace or an account never in it — and the member outside it hears none"
#   and "a reaction in a public channel’s SyncUp is heard from any member, and not from a member removed from the workspace or an account never in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (!readers || !(await this.readsCall(readers, data.userId))) return { ok: false }\n'
b = '    if (!readers) return { ok: false }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a reaction from anyone is relayed.')
