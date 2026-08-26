-- Fixtures for test/calls-http.mts. The ids are the constants at the top of
-- that file.
--
-- Three people, not two: a call needs a starter, somebody who joins, and
-- somebody who is a channel member but never joins — because "who was told
-- about the call" and "who was in it" are different sets, and a harness with
-- two people cannot tell them apart.
INSERT INTO organizations (id, name, slug)
  VALUES ('00000000-0000-4000-8000-000000000002', 'Calls Org', 'calls-org')
  ON CONFLICT DO NOTHING;

INSERT INTO users (id, email, display_name) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'me@harness.test',    'Hamda'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'them@harness.test',  'Leo'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'third@harness.test', 'Suleman')
  ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id, organization_id, name, slug)
  VALUES ('22222222-2222-4222-8222-222222222222',
          '00000000-0000-4000-8000-000000000002', 'Calls', 'calls')
  ON CONFLICT DO NOTHING;

-- Both guards run for real, so the membership rows are not optional.
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'member'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member'),
  ('22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'member')
  ON CONFLICT DO NOTHING;

INSERT INTO chat_channels (id, workspace_id, name, created_by_id)
  VALUES ('33333333-3333-4333-8333-333333333333',
          '22222222-2222-4222-8222-222222222222', 'general',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  ON CONFLICT DO NOTHING;

-- assertCanReach resolves a call in a channel against the CHANNEL's members,
-- not the workspace's, so these rows are what make the call reachable at all.
INSERT INTO chat_channel_members (channel_id, user_id) VALUES
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('33333333-3333-4333-8333-333333333333', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  ON CONFLICT DO NOTHING;
