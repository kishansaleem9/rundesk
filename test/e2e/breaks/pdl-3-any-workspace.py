# A LIST CHOSEN IN ANOTHER WORKSPACE IS USED HERE: a task made from this
# workspace's chat, with its words, lands in the other one.
# Reddens: planner-default-list: "a list chosen in another workspace is not where this workspace’s tasks go: the oldest list here is"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      if (home?.workspaceId === workspaceId && (await this.canCreateTaskIn(chosen, actorId))) return chosen\n'
b = '      if (home && (await this.canCreateTaskIn(chosen, actorId))) return chosen\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-3-any-workspace: any workspace’s list is used')
