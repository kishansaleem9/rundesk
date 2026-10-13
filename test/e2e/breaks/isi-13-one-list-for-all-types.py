# EVERY JIRA ISSUE TYPE GOES INTO ONE LIST, WHATEVER THE IMPORTER CHOSE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "with each issue type its own List and epics as tasks, a Jira project is a Folder of an Epic List and a Bug List: a story under its epic as a subtask, the story’s own subtask one level up beside it (subtasks nest one level here), each List with the statuses of the issues in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/jira.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (options.lists === 'one') {\n",
     "    if (options.lists !== 'none') {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-13-one-list-for-all-types: EVERY JIRA ISSUE TYPE GOES INTO ONE LIST, WHATEVER THE IMPORTER CHOSE.')
