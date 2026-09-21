# Point the destination picker back at GET /lists/space/:id, which answers a
# narrower question: the lists of the space's hidden default container. Every
# space whose lists live in real projects reports having none.
# Reddens: space-create-menu: "a form created through the menu exists and files into the list it was given"
import io
p = "/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx"
a = """    queryKey: ['lists', 'workspace', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string; spaceId: string }>>(`/lists/workspace/${workspaceId}`),
  })
  const lists = (listsQuery.data ?? []).filter((l) => l.spaceId === spaceId)"""
b = """    queryKey: ['lists', 'space', spaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string; spaceId: string }>>(`/lists/space/${spaceId}`),
    enabled: !!spaceId,
  })
  const lists = listsQuery.data ?? []"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the picker asks the space endpoint again and sees no lists.')
