# THE TOP ROW'S LAST TWO FACETS IN THE WRONG ORDER (`ledger-rows/row-1874`).
#
# Frame `12:14` reads Use Cases · Tags · Created by. Here Created by is drawn
# before Tags: both menus are present and both work, and only their order is
# wrong — which is what a "both are there" check would miss.
#
# Reddens: template-center: "the top row offers the frame's three facets — Use Cases, Tags, Created by — in that order"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
tags = """          <span className="sr-only">{t('templates.tags')}</span>
          <select
            data-testid="templates-facet-tag"
            value={tag ? (tagBuckets.find((b) => b.value.toLowerCase() === tag.toLowerCase())?.value ?? tag) : ''}
            onChange={(e) => setTag(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm text-foreground"
          >
            <option value="">{t('templates.tagsAll')}</option>
            {tagBuckets.map((b) => (
              <option key={b.value.toLowerCase()} value={b.value}>
                {b.value} ({b.count})
              </option>
            ))}
          </select>
"""
maker = """          <span className="sr-only">{t('templates.createdBy')}</span>
          <select
            data-testid="templates-facet-createdby"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            className="h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm text-foreground"
          >
            <option value="">{t('templates.createdByAll')}</option>
            {makerBuckets.map((b) => (
              <option key={b.value} value={b.value}>
                {b.name} ({b.count})
              </option>
            ))}
          </select>
"""
between = """        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
"""
a = tags + between + maker
b = maker.replace('<span className="sr-only">', '{/* BROKEN: Created by before Tags */}<span className="sr-only">', 1) + between + tags
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-11-created-by-before-tags: the top row reads Use Cases, Created by, Tags')
