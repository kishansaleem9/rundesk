# THE PAGE OFFERS EVERY PERSON OF THE TOOL AS NOBODY, THEIR EMAIL’S MEMBER UNCHOSEN.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "the Asana tab says whose sign-in it is, offers its workspaces and their projects, matches its people to members by email (one who is nobody here maps to nobody), starts on sections as statuses, and reports what the run made and what Asana keeps"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const peopleMap = Object.fromEntries((people.data?.people ?? []).map((p) => [p.key, p.key in mapped ? mapped[p.key] : p.match]))\n',
     '  const peopleMap = Object.fromEntries((people.data?.people ?? []).map((p) => [p.key, p.key in mapped ? mapped[p.key] : null]))\n'),
    ("                        value={(p.key in mapped ? mapped[p.key] : p.match) ?? ''}\n",
     "                        value={(p.key in mapped ? mapped[p.key] : null) ?? ''}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-w2-people-unmatched: THE PAGE OFFERS EVERY PERSON OF THE TOOL AS NOBODY, THEIR EMAIL’S MEMBER UNCHOSEN.')
