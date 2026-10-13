# A TOKEN THE TOOL REFUSES IS NOT SAID IN THE FORM.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "Monday takes its personal API token, pasted: one Monday refuses is said in the form and nothing is kept; the right one signs in, kept sealed"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {tokenError && <ErrorLine message={tokenError} testid="import-app-token-error" />}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-w4-a-refused-token-unsaid: A TOKEN THE TOOL REFUSES IS NOT SAID IN THE FORM.')
