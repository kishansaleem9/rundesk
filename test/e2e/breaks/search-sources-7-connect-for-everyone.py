# EVERY MEMBER IS OFFERED CONNECT — which leads to a connection only `integrations.manage` may make.
# RE-AIMED 25 September: Connect is offered by the key the connect route asks for, not by
# the admin role, and leads to the App Center; the mistake is the same — the key dropped.
# Reddens: search-sources: "and a source nobody connected says so, with no Connect for a member who may not connect apps"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = "          {mayConnectApps && activeSource.heldBy !== 'someone-else' && activeSource.provider && (\n"
b = "          {(mayConnectApps || workspaceId !== '') && activeSource.heldBy !== 'someone-else' && activeSource.provider && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("search-sources-7-connect-for-everyone: applied")
