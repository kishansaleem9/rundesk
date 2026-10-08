# A TEMPLATE'S TAGS KEEP THE CASE THEY WERE TYPED IN AGAIN
# (`found-30-sep/template-tags-keep-their-case`): one spelling of a word per
# template, so a card and the facet can show it in two cases.
# Reddens: template-center: "and shows each word in lower case, as the templates carry it — client, q3, retro — whatever case it was typed in"
#          template-center: "a template made with \" Q3 \", \"client\" and \"q3\" carries q3 and client, in lower case, trimmed and once each (read from the database)"
#          template-center: "a manager, who holds template.manage by default, may tag a template somebody else made"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
i = s.index('function normalizeTemplateTags')
j = s.index('\n}\n', i)
body = s[i:j]
a = "    out.push(key)\n"
assert body.count(a) == 1, f'anchor appears {body.count(a)} times in normalizeTemplateTags, expected exactly 1'
s = s[:i] + body.replace(a, "    out.push(tag)\n") + s[j:]
io.open(p, 'w', encoding='utf-8').write(s)
print('template-center-36-tags-keep-their-case: a tag is kept as typed')
