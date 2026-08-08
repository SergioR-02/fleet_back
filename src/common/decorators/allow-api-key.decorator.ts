import { SetMetadata } from '@nestjs/common';

/** Permite autenticación por JWT o por API Key (n8n). */
export const ALLOW_API_KEY_KEY = 'allowApiKey';
export const AllowApiKey = () => SetMetadata(ALLOW_API_KEY_KEY, true);
