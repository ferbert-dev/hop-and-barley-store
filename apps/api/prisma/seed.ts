import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { catalogCategories, catalogProducts } from './catalog-fixtures';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

export async function seedCatalog(client: PrismaClient): Promise<void> {
  await client.$transaction(
    async (transaction) => {
      for (const category of catalogCategories) {
        await transaction.category.upsert({
          create: category,
          update: category,
          where: { slug: category.slug },
        });
      }

      await transaction.product.deleteMany({
        where: { slug: { in: ['house-lager', 'citrus-pale-ale'] } },
      });

      for (const product of catalogProducts) {
        const { categorySlug, stockAmount, ...data } = product;

        await transaction.product.upsert({
          create: {
            ...data,
            stockAmount,
            category: { connect: { slug: categorySlug } },
          },
          update: {
            ...data,
            // Inventory is operational state, not catalog fixture content.
            category: { connect: { slug: categorySlug } },
          },
          where: { slug: product.slug },
        });
      }

      await transaction.category.deleteMany({
        where: { slug: 'legacy-foundation' },
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

seedCatalog(prisma)
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
