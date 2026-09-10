import 'dotenv/config';
import { CheckoutService } from '../src/checkout/checkout.service';
import { PrismaService } from '../src/database/prisma.service';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const checkout = new CheckoutService(prisma);
  const cutoff = new Date();
  let purgedDraftCount = 0;

  try {
    for (;;) {
      const purged = await checkout.purgeExpiredGuestDrafts(cutoff);
      purgedDraftCount += purged.purgedDraftCount;
      if (purged.purgedDraftCount === 0) break;
    }
    console.info(
      JSON.stringify({ cutoff: cutoff.toISOString(), purgedDraftCount }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('Expired guest checkout draft purge failed');
  process.exitCode = 1;
});
