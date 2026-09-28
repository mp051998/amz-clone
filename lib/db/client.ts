import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Any Supabase client typed against our schema: cookie-bound (pages/actions),
 *  bearer-token (REST API), or service-role (trusted server writes). */
export type Db = SupabaseClient<Database>;
