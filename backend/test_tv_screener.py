"""Quick test of TradingView Screener for NSE India swing candidates."""
from tradingview_screener import Query, col

# Swing trading filter: Price above EMA50 & EMA200, RSI 40-70, volume above avg
count, df = (
    Query()
    .select(
        'name', 'close', 'volume', 'relative_volume_10d_calc',
        'RSI', 'EMA20', 'EMA50', 'EMA200',
        'MACD.macd', 'MACD.signal',
        'price_52_week_high',
    )
    .set_markets('india')
    .where(
        col('exchange').isin(['NSE']),
        col('type').isin(['stock']),
        col('close') > col('EMA200'),     # Above 200 EMA (uptrend)
        col('close') > col('EMA50'),      # Above 50 EMA (momentum)
        col('RSI').between(40, 70),       # Not overbought/oversold
        col('relative_volume_10d_calc') > 1.0,  # Above avg volume
        col('close') > 50,               # Min price filter
    )
    .order_by('relative_volume_10d_calc', ascending=False)
    .limit(50)
    .get_scanner_data()
)

print(f"Total matches: {count}")
print(f"Returned: {len(df)} stocks\n")
print(df[['ticker', 'name', 'close', 'relative_volume_10d_calc', 'RSI']].head(30).to_string())

# Extract clean symbols
symbols = [t.replace('NSE:', '') for t in df['ticker'].tolist()]
print(f"\nClean symbols: {symbols[:20]}")
