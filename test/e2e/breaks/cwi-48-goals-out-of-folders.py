# A GOAL IN A GOAL FOLDER COMES IN IN NONE.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "a Goal in a Goal Folder comes in in a Goal Folder of its name, and the Goals page draws the folder with its goal in it; a Goal in no folder is in none"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          folderId: g.folder?.trim() ? folderIds.get(g.folder.trim()) ?? null : null,\n',
     '          folderId: null,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-48-goals-out-of-folders: A GOAL IN A GOAL FOLDER COMES IN IN NONE.')
