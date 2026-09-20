"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const ip_allowlist_util_1 = require("./ip-allowlist.util");
(0, node_test_1.default)('IPv4 exact match', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('198.51.100.42', '198.51.100.42'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('198.51.100.42', '198.51.100.43'), false);
});
(0, node_test_1.default)('IPv4 CIDR ranges', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/24', '203.0.113.42'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/24', '203.0.113.255'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/24', '203.0.114.1'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('10.0.0.0/8', '10.255.13.7'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('10.0.0.0/8', '11.0.0.1'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('0.0.0.0/0', '8.8.8.8'), true); // match-all
});
(0, node_test_1.default)('IPv4 /32 behaves like exact', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('192.168.1.10/32', '192.168.1.10'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('192.168.1.10/32', '192.168.1.11'), false);
});
(0, node_test_1.default)('IPv6 exact and CIDR', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('2001:db8::/32', '2001:db8:abcd::1'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('2001:db8::/32', '2001:db9::1'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('2001:db8::1', '2001:db8::1'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('::1', '::1'), true); // loopback
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('::/0', '2001:db8::1'), true);
});
(0, node_test_1.default)('IPv4-mapped IPv6 normalises to IPv4', () => {
    // Server reports client as ::ffff:203.0.113.42 — a plain v4 rule must match.
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/24', '::ffff:203.0.113.42'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.42', '::ffff:203.0.113.42'), true);
    strict_1.default.equal((0, ip_allowlist_util_1.parseIp)('::ffff:203.0.113.42')?.version, 4);
});
(0, node_test_1.default)('version mismatch never matches', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/24', '2001:db8::1'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('2001:db8::/32', '203.0.113.42'), false);
});
(0, node_test_1.default)('garbage rules / addresses do not match (fail-closed matcher)', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('not-an-ip', '203.0.113.42'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/99', '203.0.113.42'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('999.0.0.1', '999.0.0.1'), false);
    strict_1.default.equal((0, ip_allowlist_util_1.ipMatches)('203.0.113.0/24', 'nonsense'), false);
});
(0, node_test_1.default)('isIpAllowed: empty list and missing ip are false (caller fails open)', () => {
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)('203.0.113.42', []), false);
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)(null, ['203.0.113.0/24']), false);
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)(undefined, ['203.0.113.0/24']), false);
});
(0, node_test_1.default)('isIpAllowed matches any rule in the list', () => {
    const list = ['203.0.113.0/24', '198.51.100.42', '2001:db8::/32'];
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)('203.0.113.7', list), true);
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)('198.51.100.42', list), true);
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)('2001:db8::dead', list), true);
    strict_1.default.equal((0, ip_allowlist_util_1.isIpAllowed)('8.8.8.8', list), false);
});
(0, node_test_1.default)('isValidIpRule', () => {
    for (const ok of ['203.0.113.0/24', '198.51.100.42', '2001:db8::/32', '::1', '10.0.0.0/8']) {
        strict_1.default.equal((0, ip_allowlist_util_1.isValidIpRule)(ok), true, ok);
    }
    for (const bad of ['', '   ', 'hello', '203.0.113.0/33', '2001:db8::/129', '256.0.0.1', '1.2.3']) {
        strict_1.default.equal((0, ip_allowlist_util_1.isValidIpRule)(bad), false, bad);
    }
});
//# sourceMappingURL=ip-allowlist.util.test.js.map