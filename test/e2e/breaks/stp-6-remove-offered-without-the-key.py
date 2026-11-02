# REMOVE IS OFFERED WITHOUT members.remove: the manager is shown a button the API refuses.
# Reddens: settings-tabs-by-key: "the manager opens Settings on Members alone, offered the invite form — and no member’s role to change nor anyone to remove, keys a manager does not hold"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
# Re-anchored 2 November: the owner's row offers no Remove (`found-02-nov/workspace-has-no-owner`).
a = '              {mayRemove && withinRank(own, m.role) && !m.isOwner && (\n'
b = '              {(mayRemove || true) && withinRank(own, m.role) && !m.isOwner && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-6-remove-offered-without-the-key: remove for every member')
