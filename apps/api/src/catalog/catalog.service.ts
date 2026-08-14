import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts() {
    return this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      select: {
        currency: true,
        description: true,
        id: true,
        name: true,
        priceMinor: true,
        slug: true,
      },
    });
  }
}
