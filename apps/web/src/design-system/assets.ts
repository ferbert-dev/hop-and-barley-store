import { responsiveImageSizes } from './tokens';

export type AssetCategory =
  'avatar' | 'background' | 'brand' | 'icon' | 'product';

type AssetPath = `/assets/${string}.${'svg' | 'webp'}`;

export type AssetDefinition = Readonly<{
  alt: string;
  category: AssetCategory;
  height: number;
  role: 'content' | 'decorative';
  sizes: string;
  src: AssetPath;
  width: number;
}>;

function defineAsset<const T extends AssetDefinition>(asset: T): T {
  return asset;
}

export const assets = {
  brandMark: defineAsset({
    alt: 'Hop and Barley logo',
    category: 'brand',
    height: 38,
    role: 'content',
    sizes: responsiveImageSizes.brandMark,
    src: '/assets/brand/hop-and-barley-mark.svg',
    width: 26,
  }),
  footerHops: defineAsset({
    alt: 'Hop and Barley hop illustration',
    category: 'brand',
    height: 264,
    role: 'content',
    sizes: responsiveImageSizes.footerArtwork,
    src: '/assets/brand/footer-hops.svg',
    width: 484,
  }),
  accountIcon: defineAsset({
    alt: '',
    category: 'icon',
    height: 38,
    role: 'decorative',
    sizes: responsiveImageSizes.icon,
    src: '/assets/icons/account.svg',
    width: 38,
  }),
  cartIcon: defineAsset({
    alt: '',
    category: 'icon',
    height: 38,
    role: 'decorative',
    sizes: responsiveImageSizes.icon,
    src: '/assets/icons/cart.svg',
    width: 38,
  }),
  hopsFieldHero: defineAsset({
    alt: 'Close-up hop cones and green leaves',
    category: 'background',
    height: 640,
    role: 'content',
    sizes: responsiveImageSizes.fullBleed,
    src: '/assets/backgrounds/hops-field-hero.webp',
    width: 2560,
  }),
  authPattern: defineAsset({
    alt: '',
    category: 'background',
    height: 800,
    role: 'decorative',
    sizes: responsiveImageSizes.fullBleed,
    src: '/assets/backgrounds/auth-pattern.webp',
    width: 2400,
  }),
  caramelMalt: defineAsset({
    alt: 'Caramel Malt 60L',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/caramel-malt.webp',
    width: 1000,
  }),
  cascadeHops: defineAsset({
    alt: 'Cascade hops',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/cascade-hops.webp',
    width: 1000,
  }),
  centennialHops: defineAsset({
    alt: 'Centennial hops',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/centennial-hops.webp',
    width: 1000,
  }),
  citraHops: defineAsset({
    alt: 'Citra hops',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/citra-hops.webp',
    width: 1000,
  }),
  imperialYeast: defineAsset({
    alt: 'Imperial Organic Yeast A07',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/imperial-yeast.webp',
    width: 1000,
  }),
  westCoastIpaKit: defineAsset({
    alt: 'West Coast IPA all-grain brewing kit',
    category: 'product',
    height: 833,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/west-coast-ipa-kit.webp',
    width: 1000,
  }),
  marisOtterMalt: defineAsset({
    alt: 'Maris Otter pale malt',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/maris-otter-malt.webp',
    width: 1000,
  }),
  mosaicHops: defineAsset({
    alt: 'Mosaic hops',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/mosaic-hops.webp',
    width: 1000,
  }),
  pilsnerMalt: defineAsset({
    alt: 'Pilsner malt',
    category: 'product',
    height: 760,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/pilsner-malt.webp',
    width: 1000,
  }),
  saazHops: defineAsset({
    alt: 'Saaz hops',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/saaz-hops.webp',
    width: 1000,
  }),
  safaleUs05Yeast: defineAsset({
    alt: 'SafAle US-05 dry ale yeast',
    category: 'product',
    height: 1000,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/safale-us05-yeast.webp',
    width: 667,
  }),
  unmaltedWheat: defineAsset({
    alt: 'Unmalted wheat for brewing',
    category: 'product',
    height: 667,
    role: 'content',
    sizes: responsiveImageSizes.productGrid,
    src: '/assets/products/unmalted-wheat.webp',
    width: 1000,
  }),
  reviewer01: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 425,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-01.svg',
    width: 346,
  }),
  reviewer02: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 500,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-02.svg',
    width: 500,
  }),
  reviewer03: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 1584,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-03.svg',
    width: 1030,
  }),
  reviewer04: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 1080,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-04.svg',
    width: 1920,
  }),
  reviewer05: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 500,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-05.svg',
    width: 500,
  }),
  reviewer06: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 2100,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-06.svg',
    width: 2100,
  }),
  reviewer07: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 1024,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-07.svg',
    width: 1024,
  }),
  reviewer09: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 500,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-09.svg',
    width: 500,
  }),
  reviewer10: defineAsset({
    alt: 'Illustrated reviewer avatar',
    category: 'avatar',
    height: 4000,
    role: 'content',
    sizes: responsiveImageSizes.avatar,
    src: '/assets/avatars/reviewer-10.svg',
    width: 4000,
  }),
} as const;

export const assetManifest = Object.values(
  assets,
) as readonly AssetDefinition[];

export const productAssetsBySlug = {
  'caramel-malt': assets.caramelMalt,
  'cascade-hops': assets.cascadeHops,
  'centennial-hops': assets.centennialHops,
  'citra-hops': assets.citraHops,
  'imperial-yeast': assets.imperialYeast,
  'maris-otter-malt': assets.marisOtterMalt,
  'mosaic-hops': assets.mosaicHops,
  'pilsner-malt': assets.pilsnerMalt,
  'saaz-hops': assets.saazHops,
  'safale-us05-yeast': assets.safaleUs05Yeast,
  'unmalted-wheat': assets.unmaltedWheat,
  'west-coast-ipa-kit': assets.westCoastIpaKit,
} as const;

/* Source avatar 8 is byte-for-byte identical to source avatar 4. */
export const reviewerAvatarSequence = [
  assets.reviewer01,
  assets.reviewer02,
  assets.reviewer03,
  assets.reviewer04,
  assets.reviewer05,
  assets.reviewer06,
  assets.reviewer07,
  assets.reviewer04,
  assets.reviewer09,
  assets.reviewer10,
] as const;
