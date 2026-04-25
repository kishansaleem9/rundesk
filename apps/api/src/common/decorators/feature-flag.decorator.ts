import { SetMetadata } from '@nestjs/common'
import type { FlagKey } from '@rundesk/feature-flags'

export const FEATURE_FLAG_KEY = 'feature_flag'
export const FeatureFlag = (...flags: FlagKey[]) => SetMetadata(FEATURE_FLAG_KEY, flags)
