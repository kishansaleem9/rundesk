# ONLY THE COMMENT AN ISSUE HOLDS COMES IN; THE REST ARE NOT ASKED FOR.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "its custom fields become fields of the List — a number, a dropdown holding every value the issues have — and every comment comes in, the ones past the first read from the issue’s own route; its attachment through Atlassian’s redirect to the file; every page of issues read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/jira.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        for (let page = 0; comments.length < (f.comment?.total ?? 0) && page < 100; page++) {\n',
     '        for (let page = 0; comments.length < (f.comment?.total ?? 0) && page < 0; page++) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-11-first-comment-only: ONLY THE COMMENT AN ISSUE HOLDS COMES IN; THE REST ARE NOT ASKED FOR.')
