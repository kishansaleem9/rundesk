# A FOLLOWER RULE THAT REFUSES EVERYBODY. Safe, and it breaks the Follow button.
# Reddens: task-boundaries: "while a member who can see a task follows it themselves — reading it is enough for that"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '  private async assertMayChangeFollowers(taskId: string, userId: string, actorId?: string) {\n    if (!actorId) return\n'
b = "  private async assertMayChangeFollowers(taskId: string, userId: string, actorId?: string) {\n    throw new ForbiddenException('No')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-23-follow-refuses-all: applied")
