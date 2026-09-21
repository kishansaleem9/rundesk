# The type is no longer checked against the enum, so an unknown one reaches the
# insert and comes back as a Postgres cast error — a 500 where a 400 naming the
# valid types belongs.
# IT RAN GREEN, and the check it named says in its own words what it cannot
# enforce: "refused with 400, NOT A CAST ERROR". `custom_field_type` is a
# Postgres enum, so an unknown value reaching the insert raises 22P02 and
# `AllExceptionsFilter` maps that to 400 — the same status the service returns.
# The cast error the check was written to rule out is indistinguishable from
# the refusal it wanted, by status alone.
#
# Sixth instance in one session. The suite gained a check that reads the
# sentence, and this patch reddens that one.
#
# Reddens: task-field-create — "and the refusal lists the types it would have taken"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = """    if (!CUSTOM_FIELD_TYPE_SET.has(dto.type as string)) {
      throw new BadRequestException(
        `Unknown custom field type "${dto.type}". One of: ${CUSTOM_FIELD_TYPES.join(', ')}`,
      )
    }"""
b = "    void CUSTOM_FIELD_TYPE_SET"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("custom-fields.service.ts: an unknown field type is no longer refused; it reaches the enum column.")
