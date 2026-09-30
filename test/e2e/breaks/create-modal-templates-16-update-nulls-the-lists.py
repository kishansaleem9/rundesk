# UPDATE EXISTING TEMPLATE TURNS A PEOPLE OR LABELS LIST TO NULL
# (`found-30-sep/templates-null-array-field-values`).
#
# The service's merge shapes the payload again on every PATCH that carries
# one, and this update shapes a list-valued field as the old normaliser did:
# to null. The modal's update leaves custom fields out, so the template's own
# are what is lost, from a correction to its title.
#
# Reddens: create-modal-templates: "and the People and Labels values it kept are still lists, not null (read back through the API)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "      next.payload = this.normalisePayload({ ...existing.payload, ...patch.payload })\n"
b = ("      next.payload = this.normalisePayload({\n"
     "        ...existing.payload,\n"
     "        ...patch.payload,\n"
     "        // BROKEN: the update shapes a list-valued field to null, as it used to\n"
     "        customFieldValues: (patch.payload.customFieldValues ?? existing.payload.customFieldValues ?? [])\n"
     "          .map((v) => ({ ...v, value: Array.isArray(v.value) ? null : v.value })),\n"
     "      })\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-16-update-nulls-the-lists: an update turns list-valued fields to null')
