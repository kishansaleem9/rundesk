"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const organizations_controller_1 = require("./organizations.controller");
const superAdmin = { id: 'root', email: 'root@rundesk.dev', role: 'super_admin' };
const member = { id: 'u', email: 'u@rundesk.dev', role: 'member' };
(0, node_test_1.describe)('OrganizationsController.listDirectory (global user directory)', () => {
    (0, node_test_1.it)('rejects a non-super-admin', async () => {
        const ctrl = new organizations_controller_1.OrganizationsController({});
        await strict_1.default.rejects(() => ctrl.listDirectory(member), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('forwards search + parsed pagination to the service for a super admin', async () => {
        let received;
        const svc = {
            listDirectory: (opts) => {
                received = opts;
                return Promise.resolve({ users: [], total: 0, limit: 50, offset: 0 });
            },
        };
        const ctrl = new organizations_controller_1.OrganizationsController(svc);
        await ctrl.listDirectory(superAdmin, 'ann', '25', '50');
        strict_1.default.equal(received.q, 'ann');
        strict_1.default.equal(received.limit, 25);
        strict_1.default.equal(received.offset, 50);
    });
    (0, node_test_1.it)('passes undefined pagination when the query params are absent', async () => {
        let received;
        const svc = {
            listDirectory: (opts) => {
                received = opts;
                return Promise.resolve({ users: [], total: 0, limit: 50, offset: 0 });
            },
        };
        const ctrl = new organizations_controller_1.OrganizationsController(svc);
        await ctrl.listDirectory(superAdmin);
        strict_1.default.equal(received.limit, undefined);
        strict_1.default.equal(received.offset, undefined);
    });
});
//# sourceMappingURL=organizations.controller.test.js.map