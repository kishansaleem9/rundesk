# `POST /tasks` TAKES AN ESTIMATE PAST WHAT THE COLUMN HOLDS, and Postgres refuses it in its own words.
#
# Reddens: unit: task-templates.service.test.ts "refuses an estimate below nought, or past what the column holds, on both routes, and takes tags by name on both"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/dto/task.dto.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  @Min(0)\n  @Max(ESTIMATE_MAX_SECONDS)\n  timeEstimate?: number\n',
     '  @Min(0)\n  timeEstimate?: number\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-17-post-takes-an-estimate-past-the-column-unit: POST /tasks has no ceiling on the estimate')
