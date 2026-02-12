// algotrade-pro1/utils/marketTime.ts

export const checkMarketStatus = (): boolean => {
  const now = new Date();
  
  // Convert to IST (UTC + 5:30)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 60 * 60 * 1000; 
  const istDate = new Date(utc + istOffset);

  const day = istDate.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = istDate.getHours();
  const minute = istDate.getMinutes();
  const currentMinutes = hour * 60 + minute;

  // Market Hours: 09:15 to 15:30
  const MARKET_OPEN = 9 * 60 + 15; 
  const MARKET_CLOSE = 15 * 60 + 30;

  // Closed on Weekends
  if (day === 0 || day === 6) return false;

  // Open within trading hours
  return currentMinutes >= MARKET_OPEN && currentMinutes < MARKET_CLOSE;
};