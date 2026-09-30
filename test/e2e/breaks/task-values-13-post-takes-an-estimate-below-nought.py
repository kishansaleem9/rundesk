# `POST /tasks` TAKES AN ESTIMATE BELOW NOUGHT (`found-30-sep/task-estimate-below-zero`): its body
# asks `@IsInt()` alone, as before, and `createTask` asks nothing of it.
#
# Reddens: task-values: "POST /tasks refuses an estimate below nought (400), as the template’s route does, and makes nothing (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/dto/task.dto.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  @Min(0)\n  @Max(ESTIMATE_MAX_SECONDS)\n  timeEstimate?: number\n',
     '  timeEstimate?: number\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    assertEstimate(data.timeEstimate)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-13-post-takes-an-estimate-below-nought: POST /tasks takes any whole estimate')
