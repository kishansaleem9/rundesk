/**
 * IP allowlist matching for the workspace security policy.
 *
 * Supports plain IPv4/IPv6 and CIDR ranges, with no external dependency.
 * IPv4-mapped IPv6 (e.g. `::ffff:203.0.113.42`, which is how a dual-stack
 * server often reports an IPv4 client) is normalised to its IPv4 form so a
 * plain `203.0.113.42` rule still matches.
 *
 * Everything is intentionally fail-closed at the matcher level (an unparseable
 * rule or address simply does not match); the *fail-open* safety decisions
 * (empty list, missing client IP, admin exemption) live in the caller.
 */
type ParsedIp = {
    version: 4 | 6;
    value: bigint;
};
/** Parse an address, normalising IPv4-mapped IPv6 down to IPv4. */
export declare function parseIp(input: string): ParsedIp | null;
/** True if `ip` falls inside the single rule (plain address or CIDR range). */
export declare function ipMatches(rule: string, ip: string): boolean;
/** True if `ip` matches any rule in the list. Empty list / missing ip → false. */
export declare function isIpAllowed(ip: string | null | undefined, rules: string[]): boolean;
/**
 * Canonical display form of a client IP: dotted-quad for IPv4 (including
 * IPv4-mapped IPv6), otherwise the trimmed address with brackets/zone removed.
 * Used when auto-adding the requester's IP to an allowlist so it reads cleanly.
 */
export declare function canonicalIp(input: string): string | null;
/** Validate a rule string for the admin UI / API (plain IP or CIDR). */
export declare function isValidIpRule(rule: string): boolean;
export {};
