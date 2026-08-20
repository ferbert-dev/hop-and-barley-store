import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductDetail } from '../../../features/product-detail/product-detail';
import { getProductDetail } from '../../../lib/product-detail';

export interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const result = await getProductDetail(slug);

  if (result.kind === 'not-found') notFound();
  if (result.kind === 'unavailable') {
    throw new Error('Product detail API unavailable');
  }

  return <ProductDetail product={result.product} />;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProductDetail(slug);

  if (result.kind === 'not-found') {
    return {
      description: 'This product is not part of the public catalog.',
      title: 'Product not found | Hop & Barley',
    };
  }
  if (result.kind === 'unavailable') {
    return {
      description: 'Product details are temporarily unavailable.',
      title: 'Product unavailable | Hop & Barley',
    };
  }

  return {
    description: result.product.teaser,
    title: `${result.product.name} | Hop & Barley`,
  };
}
