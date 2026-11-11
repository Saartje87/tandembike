import type { CostUnit } from '../../tickets/cost-unit';

const amountText = (amount: number) =>
  amount > 0 && amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2);

/**
 * A cost labelled by its unit (ADR 0051): dollars as `$1.20`, AI credits as
 * `1.20 AI credits`; under a cent or credit, to 4 places.
 */
export const formatCost = (amount: number, unit: CostUnit): string =>
  unit === 'usd'
    ? `$${amountText(amount)}`
    : `${amountText(amount)} AI ${amount === 1 ? 'credit' : 'credits'}`;
