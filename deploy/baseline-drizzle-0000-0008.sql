-- Used when the DB was created outside Drizzle (e.g. drizzle-kit push) but
-- drizzle.__drizzle_migrations is empty. Inserts hashes for 0000–0008 only;
-- drizzle-kit migrate then applies 0009+ from the journal.
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT v.hash, v.created_at
FROM (
  VALUES
    ('e0ba42c95fa6f80b51ccd3ab7a483aee7b6db837da92995116eb0781717282ab', 1777011511258::bigint),
    ('60b873784671ed4a3e07ebf2551ca584583fbdc5233ce1f60fcea4281a8b7787', 1777012767280::bigint),
    ('324af200846e7e71de1fca6d1a78b456493cd768a2a39eb77ec6ae9c49ea4875', 1809000000000::bigint),
    ('a6284bc95c3d8d58a1f9f3db09388f71c77a7fab4411b77243bdbc23b55e4f12', 1900000000000::bigint),
    ('8c9f0324e1061ba5c2a15479f490c41a294f4f4fdc52e5f23c770b74a5c1b1dc', 1900000001000::bigint),
    ('675a85533f9ab509e938a6bd35cb3a9268ec00436f57e37ebe0230c1ad20a84c', 1900000002000::bigint),
    ('e6c58df3a05bd6fc4843fc4514dfba0e546fd96b2b9c31bfd292a3e87f8e3dc3', 1900000003000::bigint),
    ('472fce83194c60a9022b473952aab638bd6364d0a59f78844f2ef886c62ba8b6', 1900000004000::bigint),
    ('bff00566f967296390cb34393cd4b602ab0f056169a7f62973fd901ddb12732a', 1900000005000::bigint)
) AS v(hash, created_at)
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations e WHERE e.hash = v.hash);
