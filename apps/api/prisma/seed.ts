import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const products = [
  {
    currency: 'EUR',
    description: 'Clean, crisp and brewed for long afternoons.',
    name: 'House Lager',
    priceMinor: 499,
    slug: 'house-lager',
  },
  {
    currency: 'EUR',
    description: 'Citrus-forward pale ale with a balanced finish.',
    name: 'Citrus Pale Ale',
    priceMinor: 549,
    slug: 'citrus-pale-ale',
  },
];

async function main() {
  for (const product of products) {
    await prisma.product.upsert({
      create: product,
      update: product,
      where: { slug: product.slug },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
