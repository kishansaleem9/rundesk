# The dialog opens with privacy already on, so a folder made without touching it vanishes for everybody else.
# Reddens: folder-dialog: and it starts off
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  const [isPrivate, setIsPrivate] = useState(false)\n\n  const spaces = useQuery({\n    queryKey: ['spaces', workspaceId],\n    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),\n  }).data ?? []\n\n  const create = useMutation({\n    // Folders have no page of their own"
b = "  const [isPrivate, setIsPrivate] = useState(true)\n\n  const spaces = useQuery({\n    queryKey: ['spaces', workspaceId],\n    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),\n  }).data ?? []\n\n  const create = useMutation({\n    // Folders have no page of their own"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The dialog opens with privacy already on, so a folder made without touching it vanishes for everybody else.')
