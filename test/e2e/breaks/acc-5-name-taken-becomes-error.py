# "List name taken" stops being a refusal a person can act on and becomes a raw
# failure — §V2-S11 `08:50`'s words lost on the way out.
# Reddens: ai-create-containers: "a second list with the same name is refused as `name_taken`"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """      // §V2-S11 `08:50` — "List name taken" is a 409 from the service, and it
      // is a refusal a person can act on, not an error to swallow.
      if (err instanceof ConflictException) return refuse(kind, 'name_taken')
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: a duplicate list name now throws instead of refusing by name.')
