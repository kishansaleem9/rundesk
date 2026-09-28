# A refused write says nothing at all, which looks identical to a control that is still thinking.
# Reddens: create-menu-ai: "and a refused write reaches the person as a toast, in the provider's words"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    onError: (e) =>\n      toast.error(\n        t('quickCreate.aiWriteFailed', {\n"
b = "    onError: (e) =>\n      ((_: unknown) => {})(\n        t('quickCreate.aiWriteFailed', {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: A refused write says nothing at all, which looks identical to a control that is still thinking.')
