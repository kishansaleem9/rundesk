# A REFUSED SAVE SAYS NOTHING AGAIN.
# Reddens: doc-level-controls: "a save refused (403) says so — “Your access to this doc does not allow changing it” — rather than leaving the words looking saved"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = "        toast.error(error instanceof ApiError ? error.message : t('docs.couldNotSave'))\n"
b = "        void (error instanceof ApiError ? error.message : t('docs.couldNotSave'))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-10-refused-save-silent: a refused save is silent')
