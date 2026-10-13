# A PASTED TOKEN IS KEPT WITHOUT ASKING THE TOOL WHOSE IT IS.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "Monday takes its personal API token, pasted: one Monday refuses is said in the form and nothing is kept; the right one signs in, kept sealed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const who = await this.translate(() => d.identify(token))\n',
     "    const who = await this.translate(() => d.identify(token)).catch(() => ({ name: 'Someone', email: null, account: {} }))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-22-a-token-kept-unread: A PASTED TOKEN IS KEPT WITHOUT ASKING THE TOOL WHOSE IT IS.')
