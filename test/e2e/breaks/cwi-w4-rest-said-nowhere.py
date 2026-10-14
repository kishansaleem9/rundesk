# THE REPORT DOES NOT SAY THE DIRECT MESSAGES, VIEWS AND GOAL FOLDERS IT BROUGHT.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "the admin’s direct messages come over between the same people: with Ana, its history joins the one they have here; with Nina, invited, it is the admin’s for now, and Nina’s place in it — and in Leads — waits for her"
#   or "a List’s views come in as its views here: the pinned board grouped by priority, newest due first, its default; Ana’s private list hers alone; a Form view, which no List here has, not made"
#   or "a Goal in a Goal Folder comes in in a Goal Folder of its name, and the Goals page draws the folder with its goal in it; a Goal in no folder is in none"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {(result.chatDmsImported ?? 0) > 0 && <Figure testid="import-app-r-dms" label={t(\'import.appDms\')} value={result.chatDmsImported ?? 0} />}\n',
     ''),
    ('        {(result.viewsImported ?? 0) > 0 && <Figure testid="import-app-r-views" label={t(\'import.appViews\')} value={result.viewsImported ?? 0} />}\n',
     ''),
    ('        {(result.goalFoldersImported ?? 0) > 0 && <Figure testid="import-app-r-goal-folders" label={t(\'import.appGoalFolders\')} value={result.goalFoldersImported ?? 0} />}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-w4-rest-said-nowhere: THE REPORT DOES NOT SAY THE DIRECT MESSAGES, VIEWS AND GOAL FOLDERS IT BROUGHT.')
