# POST /TASKS REFUSES AN ESTIMATE BELOW NOUGHT: `CreateTaskDto` asks `@Min(0)` again.
#
# Reddens: task-values: "POST /tasks makes a task estimated below nought and stores it, while the template’s route refuses one below nought (400), as it always has (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/dto/task.dto.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  IsUUID,\n  MaxLength,\n',
     '  IsUUID,\n  MaxLength,\n  Min,\n'),
    ('  @IsInt()\n  timeEstimate?: number\n',
     '  @IsInt()\n  @Min(0)\n  timeEstimate?: number\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-29-post-refuses-an-estimate-below-nought: CreateTaskDto refuses an estimate below nought')
