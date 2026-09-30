# EVERY LOOKUP BY EMAIL COMPARES IT AS STORED AGAIN (`found-30-sep/sign-in-reads-the-email-as-typed`).
#
# `sameEmail`, which every lookup of a person by email goes through, compares
# the column with what was typed exactly, case and all.
#
# Reddens: unit: same-email.test.ts "sameEmail lowers the stored email and the typed one alike, in Postgres, and trims what was typed"
import io
p = '/home/user/rundesk/apps/api/src/common/sql/same-email.ts'
a = "  return sql`lower(${column}) = lower(${typed.trim()})`\n"
b = "  return sql`${column} = ${typed.trim()}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-11-an-email-is-compared-as-stored-unit: sameEmail compares the email as stored')
