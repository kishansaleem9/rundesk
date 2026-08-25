-- Fixtures for test/skills-http.mts. The ids are the constants at the top of
-- that file; two members of one workspace is the minimum that can exercise the
-- owner/colleague permission matrix.
INSERT INTO organizations (id, name, slug)
  VALUES ('00000000-0000-4000-8000-000000000001', 'Harness Org', 'harness-org')
  ON CONFLICT DO NOTHING;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'me@harness.test',   'Me'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'them@harness.test', 'Them')
  ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id, organization_id, name, slug)
  VALUES ('11111111-1111-4111-8111-111111111111',
          '00000000-0000-4000-8000-000000000001', 'Harness', 'harness')
  ON CONFLICT DO NOTHING;

-- Both guards run for real, so the membership rows are not optional.
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'member'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member')
  ON CONFLICT DO NOTHING;
