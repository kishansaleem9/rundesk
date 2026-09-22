# The guard still rejects the malformed id — and reports it in the exception
# filter's own words, "A value has an invalid format".
#
# This is the defect that survives a status-code test. The request never reaches
# Postgres, the caller gets its 400, and the only thing lost is the ability to
# tell which layer refused: a guard that validated and a query that failed now
# produce byte-identical responses, so the CI log that first exposed this bug
# would read the same either way.
#
# It is a plausible edit, which is why it is worth a patch — "make our messages
# consistent with the filter's" is a tidy-up somebody does on a Friday, and the
# only thing standing between it and a silent regression is this suite asserting
# on the wording rather than the number.
#
# WHY IT ONLY MOVES THREE CHECKS. `calls.controller.ts` has its own message and
# is untouched, so "the live-call lookup rejects \"null\"" stays green. The two
# halves of this suite answer for two different code paths and a patch that
# blurred them would not say which one it had proven.
#
# Reddens: malformed-ids: "is turned away before the database"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "      if (!isUuid(id)) throw new BadRequestException(`Malformed ${kind} id`)"
b = "      if (!isUuid(id)) throw new BadRequestException('A value has an invalid format')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("resource-member.guard.ts: the guard's refusal is now indistinguishable from the database's.")
