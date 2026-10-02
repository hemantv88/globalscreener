export function classifyInstrument(stock, marketLatestDate) {
  const ticker = String(stock?.ticker ?? stock?.sym ?? '').trim().toUpperCase();
  const series = String(stock?.series ?? stock?.seriesClass ?? '').trim().toUpperCase();
  const daily = Array.isArray(stock?.daily) ? stock.daily.filter(x => x?.date) : [];
  const latest = daily.at(-1)?.date ?? stock?.derived?.updated ?? null;

  if (/[_-]RE\d*(?:$|_)/.test(ticker)) {
    return {
      instrumentType: 'RIGHTS_ENTITLEMENT',
      seriesClass: series || null,
      currentOnLatestSession: latest === marketLatestDate,
      screenEligible: false,
      eligibilityReason: 'RIGHTS_ENTITLEMENT'
    };
  }

  const seriesClass = series || null;

  const instrumentType = series === 'EQ'
    ? 'LISTED_EQUITY'
    : series
      ? 'LISTED_EQUITY_SPECIAL_SERIES'
      : 'UNKNOWN_SERIES';

  if (!latest || latest !== marketLatestDate) {
    return {
      instrumentType,
      seriesClass,
      currentOnLatestSession: false,
      screenEligible: false,
      eligibilityReason: 'NO_TRADE_ON_LATEST_MARKET_SESSION'
    };
  }

  return {
    instrumentType,
    seriesClass,
    currentOnLatestSession: true,
    screenEligible: true,
    eligibilityReason: null
  };
}

export function enrichEligibility(stock, marketLatestDate) {
  const c = classifyInstrument(stock, marketLatestDate);
  return {...stock, ...c};
}
