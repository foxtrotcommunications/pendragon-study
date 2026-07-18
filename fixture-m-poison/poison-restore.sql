BEGIN;
DELETE FROM plaid_transactions WHERE transaction_id LIKE 'POISON-%';
COMMIT;
SELECT COUNT(*) AS remaining_poison FROM plaid_transactions WHERE transaction_id LIKE 'POISON-%';
SELECT COUNT(*) AS flagged_after_restore FROM plaid_transactions WHERE quality_flag IS NOT NULL;