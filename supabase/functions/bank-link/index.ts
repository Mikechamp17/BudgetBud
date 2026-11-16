import { withCors } from '../_shared/auth.ts';
import { handler } from './handler.ts';

Deno.serve(withCors(handler));
