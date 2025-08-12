#property strict
#property copyright ""
#property link      ""
#property version   "1.00"
#property description "Stochastic Oscillator EA with full manual parameters"

//===============================
// Inputs - General
//===============================
input string   InpSymbol              = "";                  // Symbol (empty = current)
input ENUM_TIMEFRAMES InpTimeframe    = PERIOD_CURRENT;       // Stochastic timeframe
input int      InpMinBars             = 100;                  // Minimum bars required
input bool     InpTradeOnBarClose     = true;                 // Signals on bar close
input bool     InpOneTradePerBar      = true;                 // Only 1 trade per bar
input bool     InpCloseOnOpposite     = false;                // Close on opposite signal

//===============================
// Inputs - Stochastic
//===============================
input int      InpKPeriod             = 5;                    // K period
input int      InpDPeriod             = 3;                    // D period
input int      InpSlowing             = 3;                    // Slowing
input ENUM_MA_METHOD InpMaMethod      = MODE_SMA;             // MA method
input int      InpPriceField          = 0;                    // Price field (0=Low/High, 1=Close/Close)
input double   InpOverbought          = 80.0;                 // Overbought level
input double   InpOversold            = 20.0;                 // Oversold level
input bool     InpUseLevels           = true;                 // Require level filter
input bool     InpReverseSignals      = false;                // Reverse signals
input bool     InpAllowBuy            = true;                 // Allow buy
input bool     InpAllowSell           = true;                 // Allow sell

//===============================
// Inputs - Money Management
//===============================
input double   InpFixedLot            = 0.10;                 // Fixed lot
input bool     InpUseRisk             = false;                // Use risk % per trade
input double   InpRiskPercent         = 2.0;                  // Risk percent

//===============================
// Inputs - Stops
//===============================
input int      InpStopLossPips        = 200;                  // Stop Loss (pips, 0=off)
input int      InpTakeProfitPips      = 200;                  // Take Profit (pips, 0=off)
input int      InpTrailingStopPips    = 100;                  // Trailing Stop (pips, 0=off)
input int      InpTrailingStepPips    = 10;                   // Trailing Step (pips)
input int      InpBreakEvenPips       = 50;                   // Move SL to BE after (pips, 0=off)
input int      InpBreakEvenLockPips   = 10;                   // Lock profit (pips) after BE

//===============================
// Inputs - Execution & Filters
//===============================
input int      InpSlippage            = 3;                    // Slippage (points)
input int      InpMaxOrders           = 1;                    // Max concurrent orders (this magic+symbol)
input int      InpMagic               = 123456;               // Magic number
input string   InpTradeComment        = "StochEA";            // Trade comment
input int      InpMaxSpreadPips       = 20;                   // Max spread (pips, 0=off)
input bool     InpUseTradingHours     = false;                // Restrict trading hours
input int      InpStartHour           = 0;                    // Start hour (0-23)
input int      InpEndHour             = 23;                   // End hour (0-23)

//===============================
// State
//===============================
datetime g_lastSignalBarTime = 0;
datetime g_lastTradeBarTime  = 0;

//===============================
// Helpers
//===============================
string get_symbol()
{
   if(StringLen(InpSymbol) > 0) return InpSymbol;
   return _Symbol;
}

int get_digits(string symbol)
{
   return (int)MarketInfo(symbol, MODE_DIGITS);
}

double get_point(string symbol)
{
   return MarketInfo(symbol, MODE_POINT);
}

// Pip size in price units (handles 3/5-digit symbols)
double get_pip_size(string symbol)
{
   int digits = get_digits(symbol);
   double point = get_point(symbol);
   if(digits == 3 || digits == 5) return 10.0 * point;
   return point;
}

int get_spread_points(string symbol)
{
   return (int)MarketInfo(symbol, MODE_SPREAD);
}

bool is_spread_ok(string symbol)
{
   if(InpMaxSpreadPips <= 0) return true;
   double pip = get_pip_size(symbol);
   double spread_in_price = get_spread_points(symbol) * get_point(symbol);
   return (spread_in_price <= InpMaxSpreadPips * pip + 1e-8);
}

bool is_within_trading_hours()
{
   if(!InpUseTradingHours) return true;
   int hour = TimeHour(TimeCurrent());
   if(InpStartHour == InpEndHour) return true;
   if(InpStartHour < InpEndHour)
      return (hour >= InpStartHour && hour <= InpEndHour);
   return (hour >= InpStartHour || hour <= InpEndHour);
}

bool is_new_signal_bar(string symbol, ENUM_TIMEFRAMES tf)
{
   datetime bar_time = iTime(symbol, tf, 0);
   if(!InpTradeOnBarClose) return true;
   if(bar_time != g_lastSignalBarTime)
   {
      g_lastSignalBarTime = bar_time;
      return true;
   }
   return false;
}

bool can_trade_this_bar(string symbol, ENUM_TIMEFRAMES tf)
{
   if(!InpOneTradePerBar) return true;
   datetime bar_time = iTime(symbol, tf, 0);
   if(bar_time != g_lastTradeBarTime) return true;
   return false;
}

void mark_trade_this_bar(string symbol, ENUM_TIMEFRAMES tf)
{
   g_lastTradeBarTime = iTime(symbol, tf, 0);
}

int count_open_orders(string symbol)
{
   int count = 0;
   for(int i = OrdersTotal() - 1; i >= 0; --i)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != symbol) continue;
      if(OrderMagicNumber() != InpMagic) continue;
      int type = OrderType();
      if(type == OP_BUY || type == OP_SELL) count++;
   }
   return count;
}

double normalize_price(string symbol, double price)
{
   int digits = get_digits(symbol);
   return NormalizeDouble(price, digits);
}

double calculate_lot(string symbol, int stoploss_pips)
{
   double lot = InpFixedLot;
   if(!InpUseRisk)
      return NormalizeDouble(lot, 2);
   // Simple risk calculation using stop in price and tick value
   if(stoploss_pips <= 0)
      return NormalizeDouble(lot, 2);

   double pip = get_pip_size(symbol);
   double sl_price = stoploss_pips * pip;

   double tick_value = MarketInfo(symbol, MODE_TICKVALUE);
   double tick_size  = MarketInfo(symbol, MODE_TICKSIZE);
   if(tick_size <= 0) tick_size = get_point(symbol);

   double contract_size = MarketInfo(symbol, MODE_LOTSIZE);
   if(contract_size <= 0) contract_size = 100000.0;

   double money_risk = AccountBalance() * MathMax(InpRiskPercent, 0.0) / 100.0;
   if(money_risk <= 0) money_risk = 0.0;

   // Profit per price unit for 1 lot
   double value_per_price_unit_per_lot = (contract_size * tick_value) / tick_size;
   if(value_per_price_unit_per_lot <= 0)
      return NormalizeDouble(lot, 2);

   double lot_calc = money_risk / (sl_price * value_per_price_unit_per_lot);
   lot_calc = MathMax(lot_calc, 0.01);

   double lot_step = MarketInfo(symbol, MODE_LOTSTEP);
   double min_lot = MarketInfo(symbol, MODE_MINLOT);
   double max_lot = MarketInfo(symbol, MODE_MAXLOT);

   if(lot_step <= 0.0) lot_step = 0.01;
   if(min_lot <= 0.0) min_lot = 0.01;
   if(max_lot <= 0.0) max_lot = 100.0;

   double rounded = MathFloor(lot_calc / lot_step) * lot_step;
   rounded = MathMax(rounded, min_lot);
   rounded = MathMin(rounded, max_lot);
   return NormalizeDouble(rounded, 2);
}

void update_trailing_stop(string symbol)
{
   if(InpTrailingStopPips <= 0) return;
   double pip = get_pip_size(symbol);
   double trail = InpTrailingStopPips * pip;
   double step  = MathMax(InpTrailingStepPips, 1) * pip;

   RefreshRates();
   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);

   for(int i = OrdersTotal() - 1; i >= 0; --i)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != symbol) continue;
      if(OrderMagicNumber() != InpMagic) continue;

      int type = OrderType();
      if(type == OP_BUY)
      {
         double new_sl = bid - trail;
         new_sl = normalize_price(symbol, new_sl);
         if(OrderStopLoss() < 0.0000001)
         {
            if(new_sl > OrderOpenPrice())
               OrderModify(OrderTicket(), OrderOpenPrice(), new_sl, OrderTakeProfit(), 0, clrNONE);
         }
         else if(new_sl - OrderStopLoss() > step && new_sl > OrderStopLoss())
         {
            if(new_sl > OrderOpenPrice())
               OrderModify(OrderTicket(), OrderOpenPrice(), new_sl, OrderTakeProfit(), 0, clrNONE);
         }
      }
      else if(type == OP_SELL)
      {
         double new_sl = ask + trail;
         new_sl = normalize_price(symbol, new_sl);
         if(OrderStopLoss() < 0.0000001)
         {
            if(new_sl < OrderOpenPrice())
               OrderModify(OrderTicket(), OrderOpenPrice(), new_sl, OrderTakeProfit(), 0, clrNONE);
         }
         else if(OrderStopLoss() - new_sl > step && new_sl < OrderStopLoss())
         {
            if(new_sl < OrderOpenPrice())
               OrderModify(OrderTicket(), OrderOpenPrice(), new_sl, OrderTakeProfit(), 0, clrNONE);
         }
      }
   }
}

void update_breakeven(string symbol)
{
   if(InpBreakEvenPips <= 0) return;
   double pip = get_pip_size(symbol);
   double be_distance = InpBreakEvenPips * pip;
   double lock = MathMax(InpBreakEvenLockPips, 0) * pip;

   RefreshRates();
   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);

   for(int i = OrdersTotal() - 1; i >= 0; --i)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != symbol) continue;
      if(OrderMagicNumber() != InpMagic) continue;

      int type = OrderType();
      if(type == OP_BUY)
      {
         double profit_distance = bid - OrderOpenPrice();
         if(profit_distance >= be_distance)
         {
            double new_sl = OrderOpenPrice() + lock;
            new_sl = normalize_price(symbol, new_sl);
            if(OrderStopLoss() < new_sl)
               OrderModify(OrderTicket(), OrderOpenPrice(), new_sl, OrderTakeProfit(), 0, clrNONE);
         }
      }
      else if(type == OP_SELL)
      {
         double profit_distance = OrderOpenPrice() - ask;
         if(profit_distance >= be_distance)
         {
            double new_sl = OrderOpenPrice() - lock;
            new_sl = normalize_price(symbol, new_sl);
            if(OrderStopLoss() < 0.0000001 || OrderStopLoss() > new_sl)
               OrderModify(OrderTicket(), OrderOpenPrice(), new_sl, OrderTakeProfit(), 0, clrNONE);
         }
      }
   }
}

bool cross_up(double prevA, double prevB, double currA, double currB)
{
   return (prevA <= prevB && currA > currB);
}

bool cross_down(double prevA, double prevB, double currA, double currB)
{
   return (prevA >= prevB && currA < currB);
}

bool get_stochastic_values(string symbol, ENUM_TIMEFRAMES tf, int shift, double &k_value, double &d_value)
{
   // MT4: iStochastic returns the indicator value directly via mode+shift
   k_value = iStochastic(symbol, tf, InpKPeriod, InpDPeriod, InpSlowing, InpMaMethod, InpPriceField, MODE_MAIN, shift);
   d_value = iStochastic(symbol, tf, InpKPeriod, InpDPeriod, InpSlowing, InpMaMethod, InpPriceField, MODE_SIGNAL, shift);
   return !(k_value == EMPTY_VALUE || d_value == EMPTY_VALUE);
}

bool compute_signals(string symbol, ENUM_TIMEFRAMES tf, bool &buy_signal, bool &sell_signal)
{
   int shift_curr = InpTradeOnBarClose ? 1 : 0;
   int shift_prev = shift_curr + 1;

   double k_curr, d_curr, k_prev, d_prev;
   if(!get_stochastic_values(symbol, tf, shift_curr, k_curr, d_curr)) return false;
   if(!get_stochastic_values(symbol, tf, shift_prev, k_prev, d_prev)) return false;

   bool up = cross_up(k_prev, d_prev, k_curr, d_curr);
   bool dn = cross_down(k_prev, d_prev, k_curr, d_curr);

   bool level_buy = true;
   bool level_sell = true;
   if(InpUseLevels)
   {
      level_buy = (MathMin(k_prev, k_curr) <= InpOversold || MathMin(d_prev, d_curr) <= InpOversold);
      level_sell = (MathMax(k_prev, k_curr) >= InpOverbought || MathMax(d_prev, d_curr) >= InpOverbought);
   }

   buy_signal = (up && level_buy);
   sell_signal = (dn && level_sell);

   if(InpReverseSignals)
   {
      bool tmp_b = buy_signal;
      buy_signal = sell_signal;
      sell_signal = tmp_b;
   }
   return true;
}

bool open_order(string symbol, int type)
{
   if(!is_spread_ok(symbol)) return false;

   double pip = get_pip_size(symbol);
   double sl_price = (InpStopLossPips > 0 ? InpStopLossPips * pip : 0.0);
   double tp_price = (InpTakeProfitPips > 0 ? InpTakeProfitPips * pip : 0.0);

   double lot = calculate_lot(symbol, InpStopLossPips);
   if(lot <= 0.0) return false;

   RefreshRates();
   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);

   double price = (type == OP_BUY) ? ask : bid;
   double sl = 0.0, tp = 0.0;

   if(type == OP_BUY)
   {
      if(sl_price > 0.0) sl = normalize_price(symbol, price - sl_price);
      if(tp_price > 0.0) tp = normalize_price(symbol, price + tp_price);
   }
   else if(type == OP_SELL)
   {
      if(sl_price > 0.0) sl = normalize_price(symbol, price + sl_price);
      if(tp_price > 0.0) tp = normalize_price(symbol, price - tp_price);
   }

   int ticket = OrderSend(symbol, type, lot, price, InpSlippage, sl, tp, InpTradeComment, InpMagic, 0, clrNONE);
   if(ticket < 0)
      return false;

   mark_trade_this_bar(symbol, InpTimeframe);
   return true;
}

void close_orders_on_opposite(string symbol, bool close_buy, bool close_sell)
{
   if(!InpCloseOnOpposite) return;
   RefreshRates();
   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);

   for(int i = OrdersTotal() - 1; i >= 0; --i)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != symbol) continue;
      if(OrderMagicNumber() != InpMagic) continue;

      int type = OrderType();
      if(type == OP_BUY && close_buy)
         OrderClose(OrderTicket(), OrderLots(), bid, InpSlippage, clrNONE);
      else if(type == OP_SELL && close_sell)
         OrderClose(OrderTicket(), OrderLots(), ask, InpSlippage, clrNONE);
   }
}

//===============================
// MT4 Events
//===============================
int OnInit()
{
   string symbol = get_symbol();
   if(Bars(symbol, InpTimeframe) < InpMinBars)
      return(INIT_FAILED);
   g_lastSignalBarTime = iTime(symbol, InpTimeframe, 0);
   g_lastTradeBarTime  = 0;
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
}

void OnTick()
{
   string symbol = get_symbol();
   if(!is_within_trading_hours()) return;
   if(Bars(symbol, InpTimeframe) < InpMinBars) return;

   if(InpTradeOnBarClose && !is_new_signal_bar(symbol, InpTimeframe))
      return;

   bool buy_signal=false, sell_signal=false;
   if(!compute_signals(symbol, InpTimeframe, buy_signal, sell_signal))
      return;

   if(InpCloseOnOpposite)
      close_orders_on_opposite(symbol, sell_signal, buy_signal);

   update_breakeven(symbol);
   update_trailing_stop(symbol);

   if(!can_trade_this_bar(symbol, InpTimeframe))
      return;

   int open_count = count_open_orders(symbol);
   if(open_count >= InpMaxOrders)
      return;

   if(buy_signal && InpAllowBuy)
   {
      open_order(symbol, OP_BUY);
   }
   else if(sell_signal && InpAllowSell)
   {
      open_order(symbol, OP_SELL);
   }
}