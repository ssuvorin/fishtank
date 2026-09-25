const formatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(value: number, currency = "USD") {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(value);
}
