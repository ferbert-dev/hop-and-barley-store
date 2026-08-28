import {
  CATALOG_INGREDIENT_PRODUCT_TYPES,
  type CatalogIngredientProductTypeSlug,
} from '../src/catalog/catalog-product-types';

export type CatalogCategorySlug = CatalogIngredientProductTypeSlug | 'kits';

export type CatalogProductSlug =
  | 'caramel-malt'
  | 'cascade-hops'
  | 'centennial-hops'
  | 'citra-hops'
  | 'imperial-yeast'
  | 'maris-otter-malt'
  | 'mosaic-hops'
  | 'pilsner-malt'
  | 'saaz-hops'
  | 'safale-us05-yeast'
  | 'unmalted-wheat'
  | 'west-coast-ipa-kit';

export type CatalogSpecification = {
  label: string;
  value: string | string[];
};

export type CatalogCategoryFixture = {
  displayOrder: number;
  id: string;
  name: string;
  slug: CatalogCategorySlug;
};

export type CatalogProductFixture = {
  amountUnit: 'EACH' | 'MILLIGRAM';
  categorySlug: CatalogCategorySlug;
  currency: 'USD';
  description: string;
  id: string;
  imagePath: `/assets/products/${string}.webp`;
  isActive: true;
  kitYieldVolumeMl: number | null;
  maximumOrderAmount: number | null;
  minimumOrderAmount: number;
  name: string;
  orderStepAmount: number;
  packageNetWeightMg: number | null;
  priceBasisAmount: number;
  priceMinor: number;
  priceQualifier: string;
  saleKind: 'KIT' | 'PACKAGE' | 'WEIGHT';
  slug: CatalogProductSlug;
  specifications: CatalogSpecification[];
  stockAmount: number;
  teaser: string;
};

export const catalogCategories: CatalogCategoryFixture[] = [
  ...CATALOG_INGREDIENT_PRODUCT_TYPES,
  {
    displayOrder: 5,
    id: '10000000-0000-4000-8000-000000000005',
    name: 'Kits',
    slug: 'kits',
  },
];

export const catalogProducts: CatalogProductFixture[] = [
  defineProduct({
    categorySlug: 'hops',
    description: [
      'Citra is one of the most sought-after and recognizable hop varieties in the world of craft brewing, famous for its bright and multifaceted citrus aroma. Developed in the USA, this variety is ideal for IPAs, Pale Ales, and other styles where a distinct fruity profile is desired.',
      'Citra boasts a high alpha acid content, making it excellent for both bitterness and intense aroma. It imparts notes of grapefruit, lime, passion fruit, lychee, and melon to beer, creating a unique tropical bouquet.',
      'Our T-90 pellets are hermetically sealed to preserve freshness and maximum aromatics.',
    ],
    id: '20000000-0000-4000-8000-000000000001',
    imagePath: '/assets/products/citra-hops.webp',
    name: 'Citra Hops',
    priceMinor: 599,
    priceQualifier: 'per 100g',
    slug: 'citra-hops',
    specifications: [
      { label: 'Origin', value: 'USA' },
      { label: 'Type', value: 'Aroma (Dual-Purpose)' },
      { label: 'Alpha Acids', value: '11.0% - 13.0%' },
      { label: 'Beta Acids', value: '3.0% - 4.5%' },
      {
        label: 'Aroma Profile',
        value: 'Grapefruit, Lime, Passion Fruit, Lychee, Melon',
      },
      { label: 'Usage', value: 'Late Kettle Addition, Dry Hopping' },
      {
        label: 'Recommended Beer Styles',
        value: 'IPA, Double IPA, Pale Ale, American Wheat',
      },
    ],
    teaser: 'Ideal for IPAs and Pale Ales',
  }),
  defineProduct({
    categorySlug: 'malts',
    description: [
      'Maris Otter Pale Malt is the cornerstone of British brewing heritage, a revered base malt prized by brewers worldwide for its exceptional quality and flavor.',
      'It provides a rich, slightly sweet, and biscuity malt backbone that is more complex than standard 2-row malts, with subtle nutty undertones that enhance any beer style. Perfect for creating authentic British ales such as Bitters, IPAs, Porters, and Stouts.',
      'Its excellent processing characteristics and high extract yield make it a reliable and efficient choice for both novice and experienced brewers.',
    ],
    id: '20000000-0000-4000-8000-000000000002',
    imagePath: '/assets/products/maris-otter-malt.webp',
    name: 'Maris Otter Pale Malt',
    priceMinor: 55,
    priceQualifier: 'per 100g',
    slug: 'maris-otter-malt',
    specifications: [
      { label: 'Origin', value: 'United Kingdom' },
      { label: 'Type', value: 'Base Malt' },
      { label: 'Color (°L)', value: '2.5 - 4.0 °L' },
      { label: 'Moisture', value: '4.0% max' },
      { label: 'Protein', value: '9.5% - 10.5%' },
      { label: 'Diastatic Power', value: '≈ 120 °L' },
      { label: 'Usage', value: 'Up to 100% of the grist' },
      {
        label: 'Recommended Beer Styles',
        value: 'English Pale Ale, ESB, Bitter, Porter, Stout, Mild Ale',
      },
    ],
    teaser: 'Perfect for traditional ales',
  }),
  defineProduct({
    categorySlug: 'yeast',
    description: [
      'SafAle US-05 is the most famous and popular American ale yeast in the world. This strain is renowned for its ability to produce clean, crisp beers with a neutral flavor profile, allowing the hop and malt character to shine through.',
      'With its high attenuation and high flocculation, US-05 is ideal for a wide range of American ale styles, from West Coast IPAs to American Pale Ales and Cream Ales. It forms a firm sediment, making racking and clarification easier.',
      'Reliable, easy to use, and available in a dry format, this yeast is the number one choice for brewers seeking consistent and predictable results.',
    ],
    id: '20000000-0000-4000-8000-000000000003',
    imagePath: '/assets/products/safale-us05-yeast.webp',
    name: 'SafAle US-05 Dry Ale Yeast',
    priceMinor: 325,
    priceQualifier: 'per 11.5g sachet',
    slug: 'safale-us05-yeast',
    specifications: [
      { label: 'Origin', value: 'USA' },
      { label: 'Type', value: 'Dry Ale Yeast' },
      { label: 'Attenuation', value: '78-82%' },
      { label: 'Flocculation', value: 'Medium to High' },
      { label: 'Alcohol Tolerance', value: '9-11% ABV' },
      { label: 'Fermentation Temperature', value: '59-75°F (15-24°C)' },
      {
        label: 'Pitching Rate',
        value: '11.5g sachet for 5-6 gallons (20-23 L)',
      },
      {
        label: 'Recommended Beer Styles',
        value:
          'American Pale Ale, American IPA, Brown Ale, Porter, Stout, American Wheat',
      },
    ],
    teaser: 'Clean fermenting American ale yeast',
  }),
  defineProduct({
    categorySlug: 'hops',
    description: [
      'Cascade is arguably the most famous hop in the American craft brewing revolution. Developed in Oregon, it has a unique floral and citrus character that defined the taste of the classic American Pale Ale.',
      'Its moderate bitterness and vibrant aroma, with notes of grapefruit, orange, and light floral undertones, make it incredibly versatile. Cascade is excellent for both bittering and late kettle additions or for dry hopping.',
      'This hop is a reliable choice for brewers looking to create a refreshing, balanced, and recognizable ale.',
    ],
    id: '20000000-0000-4000-8000-000000000004',
    imagePath: '/assets/products/cascade-hops.webp',
    name: 'Cascade Hops',
    priceMinor: 749,
    priceQualifier: 'per 100g',
    slug: 'cascade-hops',
    specifications: [
      { label: 'Origin', value: 'USA' },
      { label: 'Type', value: 'Aroma (Dual-Purpose)' },
      { label: 'Alpha Acids', value: '4.5% - 7.0%' },
      { label: 'Beta Acids', value: '4.5% - 7.0%' },
      {
        label: 'Aroma Profile',
        value: 'Medium-intensity floral, citrus (grapefruit), and spicy notes.',
      },
      { label: 'Cohumulone', value: '33% - 40%' },
      { label: 'Total Oil', value: '0.8 - 1.5 mL/100g' },
      {
        label: 'Recommended Beer Styles',
        value: 'American Pale Ale, IPA, Porter, Barleywine, Witbier',
      },
    ],
    teaser: 'Great for dry hopping',
  }),
  defineProduct({
    categorySlug: 'malts',
    description: [
      'Caramel Malt 60L (also known as Crystal 60L) is a versatile specialty malt that is a secret weapon for many brewers to enhance beer color, flavor, and body. It imparts a beautiful copper-amber hue to the brew.',
      'The flavor of this malt is characterized by distinct notes of caramel, toffee, and light hints of toasted bread. It adds a pleasant sweetness to the beer that beautifully balances hop bitterness and also contributes to improved head retention.',
      'Caramel Malt 60L is ideal for a wide range of styles, from Pale Ales and Amber Ales to Porters and Stouts, adding complexity and depth.',
    ],
    id: '20000000-0000-4000-8000-000000000005',
    imagePath: '/assets/products/caramel-malt.webp',
    name: 'Caramel Malt 60L',
    priceMinor: 66,
    priceQualifier: 'per 100g',
    slug: 'caramel-malt',
    specifications: [
      { label: 'Origin', value: 'USA / Belgium' },
      { label: 'Type', value: 'Crystal/Caramel Malt' },
      { label: 'Color (°L)', value: '60 °L' },
      { label: 'Moisture', value: '5.0% max' },
      { label: 'Extract FG, Dry', value: '75%' },
      {
        label: 'Flavor Profile',
        value: 'Sweet, caramel, toffee, hints of toasted bread',
      },
      { label: 'Usage', value: 'Typically 3-15% of the grist' },
      {
        label: 'Recommended Beer Styles',
        value: 'Pale Ale, Amber Ale, IPA, Brown Ale, Porter, Stout, Scotch Ale',
      },
    ],
    teaser: 'Head retention in darker beers',
  }),
  defineProduct({
    categorySlug: 'hops',
    description: [
      'Saaz is a noble hop, the heart and soul of classic Bohemian and Czech pilsners. Grown in the Žatec region of the Czech Republic, it possesses a delicate and refined aromatic profile that is unmistakable.',
      'Its aroma is characterized by soft, spicy, herbal, and floral notes. Saaz is primarily used for aroma rather than bitterness, as its alpha acid content is low. It imparts a classic European elegance and clean taste to the beer.',
      'If you aim to brew an authentic Czech pilsner, European lager, or Belgian ale, Saaz is an indispensable ingredient.',
    ],
    id: '20000000-0000-4000-8000-000000000006',
    imagePath: '/assets/products/saaz-hops.webp',
    name: 'Saaz Hops',
    priceMinor: 475,
    priceQualifier: 'per 100g',
    slug: 'saaz-hops',
    specifications: [
      { label: 'Origin', value: 'Czech Republic' },
      { label: 'Type', value: 'Aroma' },
      { label: 'Alpha Acids', value: '2.0% - 5.0%' },
      { label: 'Beta Acids', value: '4.5% - 8.0%' },
      {
        label: 'Aroma Profile',
        value: 'Mild, pleasant, earthy, spicy, and floral.',
      },
      { label: 'Cohumulone', value: '23% - 28%' },
      { label: 'Total Oil', value: '0.4 - 1.0 mL/100g' },
      {
        label: 'Recommended Beer Styles',
        value:
          'Bohemian Pilsner, German Pilsner, Light Lagers, Belgian Ales, Lambic',
      },
    ],
    teaser: 'Essential for Lagers',
  }),
  defineProduct({
    categorySlug: 'malts',
    description: [
      'Pilsner Malt is the lightest base malt, forming the foundation for classic German and Czech pilsners, as well as a multitude of other light lagers and ales. It is produced from high-quality two-row barley and undergoes gentle kilning at low temperatures.',
      'This malt imparts a very light, straw-like color and a clean, slightly sweet, grainy flavor to the beer. Its neutral character allows the aroma of hops and the work of the yeast to fully express themselves, making it an ideal base for beers where purity and crispness are paramount.',
      'Thanks to its high enzymatic activity, Pilsner Malt is excellent for mashes with a large proportion of unmalted grains.',
    ],
    id: '20000000-0000-4000-8000-000000000007',
    imagePath: '/assets/products/pilsner-malt.webp',
    name: 'Pilsner Malt',
    priceMinor: 49,
    priceQualifier: 'per 100g',
    slug: 'pilsner-malt',
    specifications: [
      { label: 'Origin', value: 'Germany / Belgium' },
      { label: 'Type', value: 'Base Malt' },
      { label: 'Color (°L)', value: '1.5 - 2.1 °L' },
      { label: 'Moisture', value: '4.5% max' },
      { label: 'Protein', value: '10.0% - 11.5%' },
      { label: 'Diastatic Power', value: '> 100 °Lintner' },
      { label: 'Flavor Profile', value: 'Clean, light, sweet, grainy' },
      { label: 'Usage', value: 'Up to 100% of the grist' },
      {
        label: 'Recommended Beer Styles',
        value: 'Pilsner, Helles, Kolsch, Belgian Tripel, Light Lagers, Saison',
      },
    ],
    teaser: 'Foundation for lagers and pilsners',
  }),
  defineProduct({
    categorySlug: 'yeast',
    description: [
      'Imperial Organic Yeast A07 "Flagship" is a versatile and extremely popular liquid yeast, known for its ability to create balanced ales with a light fruity character. This strain is a true workhorse and is perfect for most American beer styles.',
      '"Flagship" provides a clean fermentation with light ester notes of citrus and stone fruit that complement, rather than overpower, the hop and malt profile. It has good attenuation and moderate flocculation, leaving behind a soft and smooth mouthfeel.',
      'Thanks to the high cell count per package (200 billion), this yeast does not require a starter for most standard batches of beer, making it a convenient and reliable choice.',
    ],
    id: '20000000-0000-4000-8000-000000000008',
    imagePath: '/assets/products/imperial-yeast.webp',
    name: 'Imperial Organic Yeast A07',
    priceMinor: 899,
    priceQualifier: 'per pouch',
    slug: 'imperial-yeast',
    specifications: [
      { label: 'Strain Type', value: 'Ale' },
      { label: 'Flocculation', value: 'Medium' },
      { label: 'Attenuation', value: '73-77%' },
      { label: 'Temperature Range', value: '62-72°F (17-22°C)' },
      { label: 'Alcohol Tolerance', value: '10% ABV' },
      {
        label: 'Flavor Profile',
        value: 'Balanced, slightly fruity, hints of citrus and stone fruit.',
      },
      { label: 'Cell Count', value: '~200 Billion Cells' },
      {
        label: 'Recommended Beer Styles',
        value: 'American Pale Ale, IPA, Double IPA, Porter, Stout, Amber Ale',
      },
    ],
    teaser: 'American ales with citrus notes',
  }),
  defineProduct({
    categorySlug: 'hops',
    description: [
      'Centennial is a classic American hop often referred to as "Super Cascade" due to its similar citrus profile but with a higher intensity and alpha acid content. It is one of the "Three Cs" (along with Cascade and Columbus) that defined the flavor of American IPAs.',
      'The aroma of Centennial is powerful, with bright notes of lemon, grapefruit, and pronounced floral undertones. Unlike Cascade, it is less spicy and more "clean" in its citrus expression. Thanks to its high alpha acid content, it is excellent for both bittering and creating an intense aroma.',
      'This is an extremely versatile hop, perfect for American Pale Ales, IPAs, and Double IPAs, giving them a bright and recognizable character.',
    ],
    id: '20000000-0000-4000-8000-000000000009',
    imagePath: '/assets/products/centennial-hops.webp',
    name: 'Centennial Hops',
    priceMinor: 620,
    priceQualifier: 'per 100g',
    slug: 'centennial-hops',
    specifications: [
      { label: 'Origin', value: 'USA' },
      { label: 'Type', value: 'Dual-Purpose' },
      { label: 'Alpha Acids', value: '9.0% - 11.5%' },
      { label: 'Beta Acids', value: '3.5% - 4.5%' },
      {
        label: 'Aroma Profile',
        value: 'Intense floral and citrus (lemon, grapefruit).',
      },
      { label: 'Cohumulone', value: '28% - 30%' },
      { label: 'Total Oil', value: '1.5 - 2.5 mL/100g' },
      {
        label: 'Recommended Beer Styles',
        value:
          'All US Ale styles, especially IPA, Double IPA, and American Pale Ale.',
      },
    ],
    teaser: 'Often called "Super Cascade"',
  }),
  defineProduct({
    categorySlug: 'hops',
    description: [
      'Mosaic is one of the most vibrant and multifaceted hops on the modern craft scene. As a "daughter" of Simcoe, it inherited the best from its lineage and added a unique palette of aromas, making it a true aromatic bomb.',
      'The name "Mosaic" is fully justified: it creates a complex mosaic of flavors and aromas, including notes of tropical fruits (mango, guava), citrus (tangerine), berries (blueberry), stone fruits (peach), and even light pine and earthy undertones.',
      'This hop is ideal for dry hopping in IPA and Pale Ale styles, where it can unleash its full potential, creating a juicy, vibrant, and unforgettable beer.',
    ],
    id: '20000000-0000-4000-8000-000000000010',
    imagePath: '/assets/products/mosaic-hops.webp',
    name: 'Mosaic Hops',
    priceMinor: 950,
    priceQualifier: 'per 100g',
    slug: 'mosaic-hops',
    specifications: [
      { label: 'Origin', value: 'USA' },
      { label: 'Type', value: 'Dual-Purpose' },
      { label: 'Alpha Acids', value: '11.5% - 13.5%' },
      { label: 'Beta Acids', value: '3.2% - 3.9%' },
      {
        label: 'Aroma Profile',
        value:
          'Complex and multifaceted. Tropical fruit (mango, guava), citrus (tangerine), berry (blueberry), stone fruit (peach), pine, and earthy notes.',
      },
      { label: 'Cohumulone', value: '24% - 26%' },
      { label: 'Total Oil', value: '1.0 - 1.5 mL/100g' },
      {
        label: 'Recommended Beer Styles',
        value: 'IPA, Double IPA, Hazy/NEIPA, American Pale Ale, Session IPA.',
      },
    ],
    teaser: 'Ideal for IPAs and Pale Ales',
  }),
  defineProduct({
    categorySlug: 'kits',
    description: [
      'Brew a craft brewing classic with our "West Coast IPA - All-Grain Kit"! This kit contains all the necessary ingredients to create a bright, bitter, and incredibly aromatic IPA in the style of the US West Coast.',
      "We've selected the perfect combination of malts to achieve a clean, dry body that serves as an excellent base for a hop explosion. The kit includes a powerful combination of Centennial, Simcoe, and Columbus hops, which provide a burst of citrus, pine, and resinous notes characteristic of this style.",
      'This kit is your ticket to the world of true West Coast IPA. It comes with detailed step-by-step instructions to guide you through every stage, from mashing to bottling.',
    ],
    id: '20000000-0000-4000-8000-000000000011',
    imagePath: '/assets/products/west-coast-ipa-kit.webp',
    name: 'West Coast IPA - All-Grain Kit',
    priceMinor: 6000,
    priceQualifier: 'for 5 Gallons',
    slug: 'west-coast-ipa-kit',
    specifications: [
      { label: 'Kit Type', value: 'All-Grain' },
      { label: 'Batch Size', value: '5 Gallons (19 Liters)' },
      { label: 'Estimated OG', value: '1.065' },
      { label: 'Estimated FG', value: '1.012' },
      { label: 'Estimated ABV', value: '6.9%' },
      { label: 'IBU', value: '65' },
      {
        label: 'Included Ingredients',
        value: [
          '12 lbs Maris Otter Pale Malt',
          '1 lb Caramel Malt 40L',
          '0.5 lb Dextrin Malt',
          '1 oz Columbus Hops (60 min)',
          '1 oz Simcoe Hops (15 min)',
          '1 oz Centennial Hops (5 min)',
          '2 oz Centennial Hops (Dry Hop)',
          '1 pack SafAle US-05 Dry Ale Yeast',
          'Whirlfloc Tablet, Priming Sugar, Step-by-step Instructions',
        ],
      },
    ],
    teaser: 'West Coast IPA',
  }),
  defineProduct({
    categorySlug: 'adjuncts',
    description: [
      'Unmalted wheat is the secret ingredient behind the classic hazy, refreshing character of Belgian Witbier. Unlike malted wheat, this is raw, unprocessed grain that imparts a unique texture and flavor to the beer.',
      "Using unmalted wheat provides the beer with its characteristic light haze, a smooth, silky body, and a subtle, bready-grainy flavor that doesn't overpower the delicate notes of coriander and orange peel. The high protein content of this grain also contributes to a dense and persistent head.",
      'This ingredient is a must-have for any brewer aiming to recreate an authentic Belgian Witbier or to add complexity and body to other styles, such as Lambics.',
    ],
    id: '20000000-0000-4000-8000-000000000012',
    imagePath: '/assets/products/unmalted-wheat.webp',
    name: 'Unmalted Wheat',
    priceMinor: 40,
    priceQualifier: 'per 100g',
    slug: 'unmalted-wheat',
    specifications: [
      { label: 'Origin', value: 'Belgium / USA' },
      { label: 'Type', value: 'Unmalted Adjunct' },
      { label: 'Color (°L)', value: '~2.0 °L' },
      { label: 'Moisture', value: '12% max' },
      {
        label: 'Protein',
        value: 'High (contributes to haze and head retention)',
      },
      {
        label: 'Flavor Profile',
        value: 'Neutral, subtle raw grain, bready',
      },
      {
        label: 'Usage',
        value:
          'Typically 30-50% of the grist for Witbiers. Requires a cereal mash or a mash with high diastatic power malts (like Pilsner or 6-Row).',
      },
      {
        label: 'Recommended Beer Styles',
        value: 'Belgian Witbier, Lambic, Grand Cru, certain Saisons.',
      },
    ],
    teaser: 'Belgian Witbier',
  }),
];

function defineProduct(
  input: Omit<
    CatalogProductFixture,
    | 'amountUnit'
    | 'currency'
    | 'description'
    | 'isActive'
    | 'kitYieldVolumeMl'
    | 'maximumOrderAmount'
    | 'minimumOrderAmount'
    | 'orderStepAmount'
    | 'packageNetWeightMg'
    | 'priceBasisAmount'
    | 'saleKind'
    | 'stockAmount'
  > & { description: [string, string, string] },
): CatalogProductFixture {
  return {
    ...input,
    ...saleRulesFor(input.slug),
    currency: 'USD',
    description: input.description.join('\n\n'),
    isActive: true,
  };
}

type CatalogSaleRules = Pick<
  CatalogProductFixture,
  | 'amountUnit'
  | 'kitYieldVolumeMl'
  | 'maximumOrderAmount'
  | 'minimumOrderAmount'
  | 'orderStepAmount'
  | 'packageNetWeightMg'
  | 'priceBasisAmount'
  | 'saleKind'
  | 'stockAmount'
>;

function saleRulesFor(slug: CatalogProductSlug): CatalogSaleRules {
  if (
    [
      'caramel-malt',
      'cascade-hops',
      'centennial-hops',
      'citra-hops',
      'maris-otter-malt',
      'mosaic-hops',
      'pilsner-malt',
      'saaz-hops',
      'unmalted-wheat',
    ].includes(slug)
  ) {
    return {
      amountUnit: 'MILLIGRAM',
      kitYieldVolumeMl: null,
      maximumOrderAmount: null,
      minimumOrderAmount: 100_000,
      orderStepAmount: 100_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      saleKind: 'WEIGHT',
      stockAmount: 100_000_000,
    };
  }

  if (slug === 'west-coast-ipa-kit') {
    return {
      amountUnit: 'EACH',
      kitYieldVolumeMl: 18_927,
      maximumOrderAmount: null,
      minimumOrderAmount: 1,
      orderStepAmount: 1,
      packageNetWeightMg: null,
      priceBasisAmount: 1,
      saleKind: 'KIT',
      stockAmount: 100,
    };
  }

  return {
    amountUnit: 'EACH',
    kitYieldVolumeMl: null,
    maximumOrderAmount: null,
    minimumOrderAmount: 1,
    orderStepAmount: 1,
    packageNetWeightMg: slug === 'safale-us05-yeast' ? 11_500 : null,
    priceBasisAmount: 1,
    saleKind: 'PACKAGE',
    stockAmount: 100,
  };
}
