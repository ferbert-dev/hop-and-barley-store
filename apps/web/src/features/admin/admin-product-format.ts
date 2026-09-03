import type { BadgeTone } from '../../components/ui/badge';

export type AdminLifecycleStatus =
  'ACTIVE' | 'ENDING_SOON' | 'DISABLED' | 'EXPIRED' | 'SCHEDULED';

type AdminSaleKind = 'WEIGHT' | 'PACKAGE' | 'KIT';
type AdminAmountUnit = 'MILLIGRAM' | 'EACH';

const MILLIGRAMS_PER_GRAM = 1_000;
const MILLIGRAMS_PER_KILOGRAM = 1_000_000;

export function formatAdminStock(
  stockAmount: number,
  saleKind: AdminSaleKind,
  amountUnit: AdminAmountUnit,
): string {
  if (!Number.isSafeInteger(stockAmount) || stockAmount < 0) {
    return 'Unavailable';
  }

  if (saleKind === 'WEIGHT' && amountUnit === 'MILLIGRAM') {
    return formatWeight(stockAmount);
  }

  const label = saleKind === 'KIT' ? 'kit' : 'pack';
  return `${String(stockAmount)} ${label}${stockAmount === 1 ? '' : 's'}`;
}

export function formatActivationWindow(
  activeFrom: string | null,
  activeUntil: string | null,
): string {
  if (activeFrom === null && activeUntil === null) {
    return 'No activation window';
  }
  if (activeFrom !== null && activeUntil !== null) {
    return `${formatUtc(activeFrom)} to ${formatUtc(activeUntil)}`;
  }
  if (activeFrom !== null) return `Starts ${formatUtc(activeFrom)}`;
  return `Ends ${formatUtc(activeUntil ?? '')}`;
}

export function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return `${new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date)} UTC`;
}

export function getLifecyclePresentation(status: AdminLifecycleStatus): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', tone: 'success' };
    case 'DISABLED':
      return { label: 'Deactivated', tone: 'danger' };
    case 'ENDING_SOON':
      return { label: 'Ending soon', tone: 'warning' };
    case 'SCHEDULED':
      return { label: 'Scheduled', tone: 'warning' };
    case 'EXPIRED':
      return { label: 'Expired', tone: 'danger' };
  }
}

function formatWeight(amount: number): string {
  if (amount >= MILLIGRAMS_PER_KILOGRAM) {
    return `${formatDecimal(amount, MILLIGRAMS_PER_KILOGRAM)} kg`;
  }
  return `${formatDecimal(amount, MILLIGRAMS_PER_GRAM)} g`;
}

function formatDecimal(value: number, divisor: number): string {
  const whole = Math.floor(value / divisor);
  const remainder = value % divisor;
  if (remainder === 0) return String(whole);
  return `${String(whole)}.${String(remainder)
    .padStart(String(divisor - 1).length, '0')
    .replace(/0+$/u, '')}`;
}
