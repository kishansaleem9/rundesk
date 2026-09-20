# Drag for projects only, so a list cannot be moved between projects — the
# half-build that passes every project check.
# Reddens: sidebar-sections: "and a list can be dragged into another project"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    return target.kind === 'project'\n  }"
b = '    return false\n  }'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: lists are no longer accepted by any target — the tree has drag for projects only.')
