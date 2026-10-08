-- A template's tags in lower case, as ClickUp keeps a tag (`found-30-sep/template-tags-keep-their-case`):
-- each word once, in the order its first spelling held. Rows already in lower case are left alone.
UPDATE "project_templates"
SET "tags" = ARRAY(
  SELECT lower(u.t)
  FROM unnest("tags") WITH ORDINALITY AS u(t, n)
  GROUP BY lower(u.t)
  ORDER BY min(u.n)
)
WHERE "tags"::text IS DISTINCT FROM lower("tags"::text)
   OR cardinality("tags") <> (SELECT count(DISTINCT lower(x)) FROM unnest("tags") AS x);
