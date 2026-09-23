import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
export const ALLOW_FORCED_PASSWORD = 'allowForcedPassword';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AllowForcedPassword = () => SetMetadata(ALLOW_FORCED_PASSWORD, true);
