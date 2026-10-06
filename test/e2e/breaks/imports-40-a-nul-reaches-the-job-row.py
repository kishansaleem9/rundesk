# A ROW'S ERROR REACHES THE JOB ROW WITH ITS NUL (`found-5-oct/xlsx-read-as-text`): jsonb refuses it, the run fails on its last write
# in the raw words "unsupported Unicode escape sequence", and the good rows around the bad one are taken away with it.
# Reddens: imports: "a row holding a NUL fails alone: the job completes with the rows around it imported, and that row’s error is reported without the NUL"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          result: storable(summary) as unknown as Record<string, unknown>,\n'
b = '          result: summary as unknown as Record<string, unknown>,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-40-a-nul-reaches-the-job-row: the job row is written with a NUL in it')
