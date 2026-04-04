import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/trpc/app-router';
import { createContext } from '@/server/trpc/context';
import type { NextRequest } from 'next/server';

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ error, type, path }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        console.error(`tRPC error on ${path}:`, error);
      }
    },
  });

export { handler as GET, handler as POST };
