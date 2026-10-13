# ONLY THE FIRST PAGE OF A JIRA SITE’S PROJECTS IS READ.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "Jira is signed in to through Atlassian, asking to read offline so the grant lasts; its sites and every page of their projects are what may be chosen"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/jira.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (body.isLast !== false || rows.length === 0) break\n',
     '      break\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-33-jira-one-page-of-projects: ONLY THE FIRST PAGE OF A JIRA SITE’S PROJECTS IS READ.')
