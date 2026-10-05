# POST /TASKS'S BODY REFUSES AN ESTIMATE BELOW NOUGHT (`@Min(0)`).
#
# Reddens: unit: task-templates.service.test.ts "takes any whole estimate on POST /tasks, below nought among them, where the template’s route refuses one below nought, and takes tags by name on both"
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
print('tvs-8-post-refuses-an-estimate-below-nought-unit: CreateTaskDto refuses an estimate below nought')
