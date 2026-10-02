export function classifyInstrument(stock, marketLatestDate) {
  const ticker = String(stock?.ticker ?? '').trim().toUpperCase();
  const series = String(stock?.series ?? '').trim().toUpperCase();
  const daily = Array.isArray(stock?.daily) ? stock.daily.filter(x => x?.date) : [];
  const latest = daily.at(-1)?.date ?? null;

  if (/_RE(?:$|_)/.test(ticker)) {
    return {
      instrumentType: 'RIGHTS_ENTITLEMENT',
      seriesClass: series || null,
      currentOnLatestSession: latest === marketLatestDate,
      screenEligible: false,
      eligibilityReason: 'RIGHTS_ENTITLEMENT'
    };
  }

  const seriesClass = series || null;

  if (!latest || latest !== marketLatestDate) {
    return {
      instrumentType: seriesClass,
      seriesClass,
      currentOnLatestSession: false,
      screenEligible: false,
      eligibilityReason: 'NO_TRADE_ON_LATEST_MARKET_SESSION'
    };
  }

  return {
    instrumentType: seriesClass,
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
