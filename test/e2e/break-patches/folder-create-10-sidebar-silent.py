# Put the sidebar's folder create back to a silent failure — the window.alert
# shape, which in a headless browser is no surface at all.
# Reddens: folder-create: "the sidebar path reports the refusal with the same words"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "      toast.error(err instanceof Error && err.message ? err.message : t('nav.createFolderError'))\n"
b = "      void err\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the sidebar swallows a refused folder create again — the two paths disagree about whether failure exists.')
