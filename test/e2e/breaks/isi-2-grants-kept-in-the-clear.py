# A GRANT TO ANOTHER TOOL IS KEPT IN THE CLEAR.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "Asana is signed in to in its own window and comes back to the import page; the grant is kept for the person who signed in, sealed, and says whose it is"
#   or "Monday takes its personal API token, pasted: one Monday refuses is said in the form and nothing is kept; the right one signs in, kept sealed"
import io
p = '/home/user/rundesk/packages/db/src/schema/import-grants.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    accessToken: sealedText('access_token', 'import_grants.access_token'),\n",
     "    accessToken: text('access_token'),\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-2-grants-kept-in-the-clear: A GRANT TO ANOTHER TOOL IS KEPT IN THE CLEAR.')
