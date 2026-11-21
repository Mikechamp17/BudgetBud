-- Built-in categories and merchant rules (KTD15). user_id is null for built-in rows.
-- match_name values are already normalized: lowercase, no accents, no card-processor noise.

insert into public.categories (name, excluded_from_totals, sort_order) values
  ('Groceries', false, 1),
  ('Dining', false, 2),
  ('Transport', false, 3),
  ('Shopping', false, 4),
  ('Bills & utilities', false, 5),
  ('Health', false, 6),
  ('Entertainment', false, 7),
  ('Travel', false, 8),
  ('Subscriptions', false, 9),
  ('Cash', false, 10),
  ('Fees', false, 11),
  ('Income', false, 12),
  ('Transfers & payments', true, 13),
  ('Uncategorized', false, 14);

insert into public.category_rules (match_name, match_type, category_id, origin)
select r.match_name, r.match_type::public.rule_match, c.id, 'builtin'
from (values
  -- Groceries
  ('lidl', 'contains', 'Groceries'),
  ('pavi', 'contains', 'Groceries'),
  ('pama', 'contains', 'Groceries'),
  ('welbees', 'contains', 'Groceries'),
  ('greens supermarket', 'contains', 'Groceries'),
  ('scotts', 'contains', 'Groceries'),
  ('park towers', 'contains', 'Groceries'),
  ('valyou', 'contains', 'Groceries'),
  ('carrefour', 'contains', 'Groceries'),
  ('aldi', 'contains', 'Groceries'),
  ('spar', 'exact', 'Groceries'),
  -- Dining
  ('mcdonald', 'contains', 'Dining'),
  ('burger king', 'contains', 'Dining'),
  ('starbucks', 'contains', 'Dining'),
  ('costa coffee', 'contains', 'Dining'),
  ('wolt', 'contains', 'Dining'),
  ('bolt food', 'contains', 'Dining'),
  ('pizza hut', 'contains', 'Dining'),
  ('kfc', 'contains', 'Dining'),
  ('cafe', 'contains', 'Dining'),
  ('restaurant', 'contains', 'Dining'),
  -- Transport
  ('malta public transport', 'contains', 'Transport'),
  ('tallinja', 'contains', 'Transport'),
  ('bolt', 'exact', 'Transport'),
  ('uber', 'exact', 'Transport'),
  ('ecabs', 'contains', 'Transport'),
  ('gozo channel', 'contains', 'Transport'),
  ('shell', 'exact', 'Transport'),
  ('enemed', 'contains', 'Transport'),
  ('go fuel', 'contains', 'Transport'),
  -- Shopping
  ('amazon', 'contains', 'Shopping'),
  ('ikea', 'contains', 'Shopping'),
  ('zara', 'contains', 'Shopping'),
  ('h m', 'exact', 'Shopping'),
  ('primark', 'contains', 'Shopping'),
  ('temu', 'contains', 'Shopping'),
  ('shein', 'contains', 'Shopping'),
  ('aliexpress', 'contains', 'Shopping'),
  -- Bills & utilities
  ('arms', 'exact', 'Bills & utilities'),
  ('enemalta', 'contains', 'Bills & utilities'),
  ('water services', 'contains', 'Bills & utilities'),
  ('go plc', 'contains', 'Bills & utilities'),
  ('go mobile', 'contains', 'Bills & utilities'),
  ('melita', 'contains', 'Bills & utilities'),
  ('epic', 'exact', 'Bills & utilities'),
  -- Health
  ('pharmacy', 'contains', 'Health'),
  ('farmacija', 'contains', 'Health'),
  ('brown s pharmacy', 'contains', 'Health'),
  ('gym', 'contains', 'Health'),
  -- Entertainment
  ('eden cinemas', 'contains', 'Entertainment'),
  ('steam', 'exact', 'Entertainment'),
  ('playstation', 'contains', 'Entertainment'),
  -- Travel
  ('ryanair', 'contains', 'Travel'),
  ('air malta', 'contains', 'Travel'),
  ('km malta airlines', 'contains', 'Travel'),
  ('booking com', 'contains', 'Travel'),
  ('airbnb', 'contains', 'Travel'),
  ('easyjet', 'contains', 'Travel'),
  -- Subscriptions
  ('netflix', 'contains', 'Subscriptions'),
  ('spotify', 'contains', 'Subscriptions'),
  ('apple com bill', 'contains', 'Subscriptions'),
  ('google play', 'contains', 'Subscriptions'),
  ('disney plus', 'contains', 'Subscriptions'),
  ('youtube premium', 'contains', 'Subscriptions'),
  ('chatgpt', 'contains', 'Subscriptions'),
  ('claude ai', 'contains', 'Subscriptions'),
  -- Cash
  ('atm', 'contains', 'Cash'),
  ('cash withdrawal', 'contains', 'Cash'),
  -- Fees
  ('bank fee', 'contains', 'Fees'),
  ('card fee', 'contains', 'Fees'),
  ('fx fee', 'contains', 'Fees'),
  ('monthly fee', 'contains', 'Fees'),
  -- Income
  ('salary', 'contains', 'Income'),
  ('interest earned', 'contains', 'Income'),
  ('refund', 'contains', 'Income'),
  -- Transfers & payments
  ('top up', 'contains', 'Transfers & payments'),
  ('topup', 'contains', 'Transfers & payments'),
  ('revolut', 'contains', 'Transfers & payments'),
  ('transfer to', 'contains', 'Transfers & payments'),
  ('transfer from', 'contains', 'Transfers & payments'),
  ('card payment', 'contains', 'Transfers & payments'),
  ('credit card repayment', 'contains', 'Transfers & payments'),
  ('sepa transfer', 'contains', 'Transfers & payments'),
  ('standing order', 'contains', 'Transfers & payments'),
  ('exchanged to', 'contains', 'Transfers & payments')
) as r (match_name, match_type, category_name)
join public.categories c on c.name = r.category_name and c.user_id is null;
