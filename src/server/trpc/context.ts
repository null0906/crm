import { auth, getActiveSessionUser } from '@/server/lib/auth';
import { db } from '@/server/db';
import type { NextRequest } from 'next/server';

export async function createContext(req?: NextRequest) {
  const session = await auth();
  const user = await getActiveSessionUser();

  return {
    db,
    session,
    user: user ?? undefined,
    req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
