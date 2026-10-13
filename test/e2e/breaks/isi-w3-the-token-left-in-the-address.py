# TRELLO’S TOKEN IS LEFT IN THE ADDRESS, AND NOT GIVEN TO THE SERVER.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "Trello is authorized to read, and hands its token back to the import page in the address’s fragment; the page gives it to the server, which keeps it sealed, and takes it off the address"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    window.history.replaceState(null, '', window.location.pathname + window.location.search)\n    fromTrello.mutate(decodeURIComponent(handed))\n",
     '    void fromTrello\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-w3-the-token-left-in-the-address: TRELLO’S TOKEN IS LEFT IN THE ADDRESS, AND NOT GIVEN TO THE SERVER.')
