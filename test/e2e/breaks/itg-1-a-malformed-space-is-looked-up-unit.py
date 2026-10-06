# A MALFORMED TARGET SPACE IS LOOKED UP (`found-5-oct/import-writes-into-another-workspace`): Postgres refuses the query
# rather than the route refusing the request.
# Reddens: unit: import-target.test.ts "a malformed id is 400, and nothing is looked up"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (typeof params.spaceId !== 'string' || !isUuid(params.spaceId)) {\n    throw new BadRequestException('Malformed space id')\n  }\n"
b = ""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("itg-1-a-malformed-space-is-looked-up-unit: a malformed space id is looked up")
