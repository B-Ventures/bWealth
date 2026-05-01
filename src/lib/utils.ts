import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInMonths, parseISO } from "date-fns";
import { Beneficiary } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function getTotalGoal(b: Beneficiary): number {
  if (b.monthlyTarget && b.targetAge) {
    return b.monthlyTarget * 12 * b.targetAge;
  }
  return b.goalAmount || 0;
}

export function getExpectedSavings(b: Beneficiary): number {
  if (b.birthDate && b.monthlyTarget) {
    const months = differenceInMonths(new Date(), parseISO(b.birthDate));
    const expected = Math.max(0, months * b.monthlyTarget);
    return Math.min(expected, getTotalGoal(b));
  }
  return 0;
}

