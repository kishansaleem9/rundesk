# The type is no longer checked against the enum, so an unknown one reaches the
# insert and comes back as a Postgres cast error — a 500 where a 400 naming the
# valid types belongs.
# Reddens: task-field-create — "a type the enum has not got is refused with 400"
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
