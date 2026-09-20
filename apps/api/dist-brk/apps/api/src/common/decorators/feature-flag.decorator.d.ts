import type { FlagKey } from '@rundesk/feature-flags';
export declare const FEATURE_FLAG_KEY = "feature_flag";
export declare const FeatureFlag: (...flags: FlagKey[]) => import("@nestjs/common").CustomDecorator<string>;
