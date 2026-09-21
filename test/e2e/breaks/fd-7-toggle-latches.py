# The privacy switch remembers the last answer across dialogs, privatising the next folder unasked.
# Reddens: folder-dialog: reopening the dialog shows the toggle off again
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '\n  const [isPrivate, setIsPrivate] = useState(false)\n'
b = '\n  const [isPrivate, setIsPrivateRaw] = useState<boolean>((globalThis as unknown as { __rdLastPrivate?: boolean }).__rdLastPrivate === true)\n  const setIsPrivate = (next: boolean) => {\n    ;(globalThis as unknown as { __rdLastPrivate?: boolean }).__rdLastPrivate = next\n    setIsPrivateRaw(next)\n  }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The privacy switch remembers the last answer across dialogs, privatising the next folder unasked.')
