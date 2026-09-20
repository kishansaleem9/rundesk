"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlag = exports.FEATURE_FLAG_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.FEATURE_FLAG_KEY = 'feature_flag';
const FeatureFlag = (...flags) => (0, common_1.SetMetadata)(exports.FEATURE_FLAG_KEY, flags);
exports.FeatureFlag = FeatureFlag;
//# sourceMappingURL=feature-flag.decorator.js.map