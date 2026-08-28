export function isNormalizedEmailConflict(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  if (candidate.code !== 'P2002' || !isRecord(candidate.meta)) return false;

  if (isNormalizedEmailTarget(candidate.meta.target)) return true;

  const driverAdapterError = candidate.meta.driverAdapterError;
  if (!isRecord(driverAdapterError) || !isRecord(driverAdapterError.cause)) {
    return false;
  }
  const cause = driverAdapterError.cause;
  if (
    cause.kind !== 'UniqueConstraintViolation' ||
    !isRecord(cause.constraint)
  ) {
    return false;
  }
  return (
    cause.constraint.index === 'User_normalizedEmail_key' ||
    isNormalizedEmailTarget(cause.constraint.fields)
  );
}

function isNormalizedEmailTarget(target: unknown): boolean {
  return (
    target === 'User_normalizedEmail_key' ||
    target === 'normalizedEmail' ||
    (Array.isArray(target) &&
      target.length === 1 &&
      (target[0] === 'normalizedEmail' || target[0] === '"normalizedEmail"'))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
