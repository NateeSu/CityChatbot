export type DatabaseTimestamp = string | Date;

export const databaseTimestamp = (value: DatabaseTimestamp, field: string): string => {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} contains an invalid database timestamp`);
  return parsed.toISOString();
};

export const optionalDatabaseTimestamp = (
  value: DatabaseTimestamp | null,
  field: string,
): string | undefined => value === null ? undefined : databaseTimestamp(value, field);
