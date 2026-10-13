# A JIRA STORY STAYS BESIDE ITS EPIC WHEN EPICS ARE TO HOLD THEIR ISSUES.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "with each issue type its own List and epics as tasks, a Jira project is a Folder of an Epic List and a Bug List: a story under its epic as a subtask, the story’s own subtask one level up beside it (subtasks nest one level here), each List with the statuses of the issues in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/jira.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (parent && (i.fields.issuetype?.subtask || !linked || !isEpic(parent.fields.issuetype))) {\n',
     '      if (parent && (i.fields.issuetype?.subtask || !isEpic(parent.fields.issuetype))) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-10-stories-beside-epics: A JIRA STORY STAYS BESIDE ITS EPIC WHEN EPICS ARE TO HOLD THEIR ISSUES.')
