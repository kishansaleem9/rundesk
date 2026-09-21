# The privacy switch remembers the last answer across dialogs, privatising the next folder unasked.
# Reddens: folder-dialog: reopening the dialog shows the toggle off again
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  const [isPrivate, setIsPrivate] = useState(false)\n\n  const spaces = useQuery({\n    queryKey: ['spaces', workspaceId],\n    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),\n  }).data ?? []\n\n  const create = useMutation({\n    // Folders have no page of their own"
b = "  const [isPrivate, setIsPrivateRaw] = useState<boolean>((globalThis as unknown as { __rdLastPrivate?: boolean }).__rdLastPrivate === true)\n  const setIsPrivate = (next: boolean) => {\n    ;(globalThis as unknown as { __rdLastPrivate?: boolean }).__rdLastPrivate = next\n    setIsPrivateRaw(next)\n  }\n\n  const spaces = useQuery({\n    queryKey: ['spaces', workspaceId],\n    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),\n  }).data ?? []\n\n  const create = useMutation({\n    // Folders have no page of their own"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The privacy switch remembers the last answer across dialogs, privatising the next folder unasked.')
