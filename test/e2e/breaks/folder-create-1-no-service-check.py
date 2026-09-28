# Drop the service's name check, so the INDEX answers instead of the API.
# The status stays 409 (the API maps unique violations), but the message
# degrades to a generic one — which is the whole reason the check exists.
# Reddens: folder-create: "and the message reads \"Folder name taken\""
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "    await this.assertFolderNameFree(spaceId, name)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('folders.service.ts: create no longer asks whether the name is free — the unique index answers, with words nobody wrote.')
