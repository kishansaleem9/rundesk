# The null bucket dropped from the Use Cases facet. Four buckets that each
# count correctly, and one template that is in the corpus and in no count —
# the facet adds up to nine out of ten and says nothing about the tenth.
import io
p='/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s=io.open(p,encoding='utf-8').read()
a="const USE_CASE_BUCKETS = [...TEMPLATE_USE_CASES, 'other'] as const"
assert s.count(a)==1, 'anchor not found exactly once'
io.open(p,'w',encoding='utf-8').write(
    s.replace(a,"const USE_CASE_BUCKETS = [...TEMPLATE_USE_CASES] as const"))
print('BREAK 9: the "no use case" bucket is gone; one fixture is now uncounted')
