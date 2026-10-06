# SAVE AS TEMPLATE PROMISES "CUSTOM-FIELD VALUES" WITH NO EXCEPTION again, while Voting, Files, Formula
# and Progress (Auto) values are not kept.
# Reddens: role-permissions-web: "the Save as template dialog says which fields a template does not keep — Voting, Files, Formula and Progress (Auto) — beside the custom-field values it keeps"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = " A Voting, Files, Formula or Progress (Auto) field’s value is not kept: votes and files are people’s own, and a formula or an automatic progress is worked out where the template is used.',\n"
b = "',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-10-the-template-words-promise-every-field: catalogs.ts: Save as template promises every custom-field value again.')
