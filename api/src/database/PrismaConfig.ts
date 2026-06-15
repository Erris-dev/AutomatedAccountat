import { PrismaClient } from "@prisma/client";

import { config } from "../config/env";

const createPrismaClient = () =>
  new PrismaClient({
    datasources: {
      db: {
        url: config.database.url,
      },
    },
    log: ["warn", "error"],
  });

export const prisma = createPrismaClient();

export const connectPrisma = async (): Promise<void> => {
  await prisma.$connect();
};

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};

export type PrismaDatabaseClient = typeof prisma;
