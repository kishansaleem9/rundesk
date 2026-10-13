# A TRELLO CARD’S LINKS ARE DROPPED FROM ITS DESCRIPTION.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "its comments come in oldest first, every page of them, under the member mapped or the importer with the author named; an uploaded file is a file and a link a link in the description; a card was made when its id says"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/trello.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const links = (c.attachments ?? []).filter((a) => !a.isUpload && a.url)\n',
     '      const links = (c.attachments ?? []).filter(() => false)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-36-links-dropped: A TRELLO CARD’S LINKS ARE DROPPED FROM ITS DESCRIPTION.')
