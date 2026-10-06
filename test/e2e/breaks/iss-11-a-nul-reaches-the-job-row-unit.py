# A ROW'S ERROR REACHES THE JOB ROW WITH ITS NUL (`found-5-oct/xlsx-read-as-text`): the last write is refused and the run fails.
# Reddens: unit: spreadsheet-import.service.test.ts "a NUL in a row’s title reaches the job row as U+FFFD: that row fails alone and the run completes"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          result: storable(summary) as unknown as Record<string, unknown>,\n'
b = '          result: summary as unknown as Record<string, unknown>,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-11-a-nul-reaches-the-job-row-unit: the job row is written with a NUL in it')
