# A DUPLICATE TAKES NO FOLLOWER, the Watchers box ticked or not.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and with Keep checked items ticked the copy keeps the ticked item ticked and the other not, and the member who follows the original follows the copy (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '    if (take.watchers) await this.tasksService.copyFollowersTo(taskId, task.id, actor.id)\n'
b = '    // BROKEN: the followers stay behind\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-52-the-followers-stay-behind: a duplicate copies no follower')
