BEGIN;
DELETE FROM plaid_transactions WHERE transaction_id LIKE 'POISON-%';
COMMIT;
SELECT COUNT(*)::int AS c FROM plaid_transactions WHERE transaction_id LIKE 'POISON-%';
