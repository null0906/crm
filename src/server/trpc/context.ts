import { auth } from '@/server/lib/auth';
import { db } from '@/server/db';
import type { SessionUser } from '@/lib/types';
import type { NextRequest } from 'next/server';

export async function createContext(req?: NextRequest) {
  const session = await auth();

  return {
    db,
    session,
    user: session?.user as SessionUser | undefined,
    req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
