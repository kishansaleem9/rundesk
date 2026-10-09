# A LIST CHOSEN IN ANOTHER WORKSPACE IS USED HERE: a task made from this
# workspace's chat, with its words, lands in the other one.
# Re-aimed 6 October: the chosen list is asked the create gate itself, which says when it is in the trash
# (`found-5-oct/default-list-files-into-an-archived-list`).
# Re-claimed 9 October: such a task goes to the person’s Personal List now, not the oldest list (`found-24-sep/planner-default-list-read-by-nothing`).
# Reddens: planner-default-list: "a list chosen in another workspace is not where this workspace’s tasks go: the person’s Personal List here is"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      if (home?.workspaceId === workspaceId) {\n        try {\n          await this.assertCanCreateTaskIn(chosen, actorId)\n'
b = '      if (home) {\n        try {\n          await this.assertCanCreateTaskIn(chosen, actorId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-3-any-workspace: any workspace’s list is used')
