# A DOCK ARRANGED TO HOLD NOTHING IS READ AS NEVER ARRANGED: the default tools come
# back over the person's own choice.
# Reddens: dock-defaults: "a dock arranged to hold nothing holds nothing — and cleared, it has its default tools again"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const storedDockTools: string[] | null = Array.isArray(dockConfigQuery.data?.pinnedLinks)\n'
b = '  const storedDockTools: string[] | null = Array.isArray(dockConfigQuery.data?.pinnedLinks) && dockConfigQuery.data.pinnedLinks.length > 0\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("dkd-3-an-empty-choice-reads-as-none: an empty choice reads as none")
