import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/server/db';
import { users, roles } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import eventBus from './event-bus';
import type { SessionUser } from '@/lib/types';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Get IP from request headers
        const ip = request.headers?.get?.('x-forwarded-for') ?? 'unknown';

        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            passwordHash: users.passwordHash,
            firstName: users.firstName,
            lastName: users.lastName,
            avatarUrl: users.avatarUrl,
            status: users.status,
            roleId: users.roleId,
            role: {
              id: roles.id,
              name: roles.name,
              slug: roles.slug,
              permissions: roles.permissions,
            },
          })
          .from(users)
          .innerJoin(roles, eq(users.roleId, roles.id))
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          eventBus.emit('user.login_failed', { email, ip });
          return null;
        }

        if (user.status !== 'active') {
          eventBus.emit('user.login_failed', { email, ip });
          return null;
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
          eventBus.emit('user.login_failed', { email, ip });
          return null;
        }

        // Update last login
        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));

        eventBus.emit('user.login', { userId: user.id, email: user.email, ip });

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          image: user.avatarUrl ?? null,
          firstName: user.firstName,
          lastName: user.lastName,
          roleId: user.roleId,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.firstName = (user as Record<string, unknown>).firstName as string;
        token.lastName = (user as Record<string, unknown>).lastName as string;
        token.companyName = (user as Record<string, unknown>).companyName as string | undefined;
        token.roleId = (user as Record<string, unknown>).roleId as string;
        token.role = (user as Record<string, unknown>).role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as unknown as Record<string, unknown>).firstName = token.firstName as string;
      (session.user as unknown as Record<string, unknown>).lastName = token.lastName as string;
      (session.user as unknown as Record<string, unknown>).companyName = token.companyName as string | undefined;
      (session.user as unknown as Record<string, unknown>).roleId = token.roleId as string;
      (session.user as unknown as Record<string, unknown>).role = token.role;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
});

export async function getActiveSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sessionUser = session?.user as SessionUser | undefined;
  if (!sessionUser?.id) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      roleId: users.roleId,
      role: {
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
        permissions: roles.permissions,
      },
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!user) return null;

  const [status] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (status?.status !== 'active') return null;

  return user as SessionUser;
}

export type { SessionUser };
