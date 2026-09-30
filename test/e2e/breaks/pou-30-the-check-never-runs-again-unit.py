# THE CHECK NEVER RUNS AGAIN AFTER BOOT (`found-30-sep/public-cdn-url-makes-every-object-public`):
# nothing asks the domain again, so one connected to the private bucket while the API runs goes unseen.
# Reddens: unit: r2-public-bucket.test.ts "the domain is checked when the API starts, before its first request, and again every hour; the pictures are moved after"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "  @Cron(CronExpression.EVERY_HOUR, { name: 'r2-public-domain-check' })\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-30-the-check-never-runs-again-unit: the hourly check is not scheduled')
