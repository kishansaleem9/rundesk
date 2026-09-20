# Point Templates at the IMPORT page: two menu items, one destination. The
# duplicated-destination defect, and it demos perfectly because both items
# navigate somewhere real.
# Reddens: sidebar-sections: "and Templates goes to the templates page"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                          navigate({ to: '/app/$workspaceId/templates', params: { workspaceId } })"
b = "                          navigate({ to: '/app/$workspaceId/import', params: { workspaceId } })"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: Templates now opens the import page — two items, one destination.')
