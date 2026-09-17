# Checkout address policy

Pure format rules shared by the API request validator and checkout form. There is no
network lookup or address data transfer. The API remains authoritative. These rules
do not verify a city, street, building, postcode allocation, or deliverability.

O2V adds country-specific postal validation for the 27 EU member states. It does
not restrict country selection, payment availability, or delivery destinations.
Existing US ZIP/state validation and optional postal data for other countries are
preserved. Unicode city/street text and optional house numbers remain supported.

## Sources and exceptions

Membership: [European Union country list](https://european-union.europa.eu/principles-countries-history/eu-countries_en).
Postal formats: [UPU addressing systems](https://www.upu.int/en/Postal-Solutions/Programmes-Services/Addressing-Solutions),
country sheets consulted on 2026-09-17 (ISO3 filenames below):

`aut`, `bel`, `bgr`, `hrv`, `cyp`, `cze`, `dnk`, `est`, `fin`, `fra`, `deu`,
`grc`, `hun`, `irl`, `ita`, `lva`, `ltu`, `lux`, `mlt`, `nld`, `pol`, `prt`,
`rou`, `svk`, `svn`, `esp`, `swe`.

Each sheet is available at
`https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/{iso3}En.pdf`.

- Ireland: Eircode is optional per [Eircode FAQ](https://www.eircode.ie/faqs).
  Supplied codes use the usual three-plus-four shape, including the D6W exception.
- Malta: the UPU sheet documents personal postcodes outside the usual three letters
  and four digits. Require a nonempty bounded code and show the usual format as
  guidance, without rejecting those exceptions.
- CZ, GR, SK, SE and NL accept compact or spaced codes; PL and PT accept compact
  or hyphenated codes. HR, CY, LV, LT and LU accept the documented international
  prefix or domestic digits. Leading zeroes are retained.
- Patterns intentionally check shape, not an exhaustive registry of assigned codes.

New requests are validated before persistence. Historical draft/order/payment
snapshots are not rewritten, and existing database structural constraints remain
unchanged. Rollback consists of reverting the package and its two consumers; no
migration or data repair is required.
