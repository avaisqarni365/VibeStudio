import { v4 as uuidv4 } from "uuid";

export function generateId(): string {
  return uuidv4();
}

export function formatCurrency(amount: number, currency = "EUR", locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: Date, locale = "de-DE"): string {
  return new Intl.DateTimeFormat(locale).format(date);
}

export function formatDateTime(date: Date, locale = "de-DE"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function parseGermanDate(dateString: string): Date {
  const parts = dateString.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid German date format. Expected DD.MM.YYYY");
  }
  const [day, month, year] = parts.map((p) => parseInt(p, 10));
  return new Date(year, month - 1, day);
}

export function calculateVAT(netAmount: number, vatRate: number): number {
  return Math.round(netAmount * vatRate) / 100;
}

export function calculateGross(netAmount: number, vatRate: number): number {
  return netAmount + calculateVAT(netAmount, vatRate);
}

export function calculateNet(grossAmount: number, vatRate: number): number {
  return Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100;
}

export function isValidTaxId(taxId: string): boolean {
  const cleanedId = taxId.replace(/\s/g, "");
  const germanTaxIdPattern = /^DE\d{9}$/;
  return germanTaxIdPattern.test(cleanedId);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}
