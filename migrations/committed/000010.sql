--! Previous: sha1:914d20d8e81f79b1e98e114302e6e48534463c27
--! Hash: sha1:8d8e38bb1b87a0a37d5a27cfd2374723b4bd67de

CREATE SCHEMA IF NOT EXISTS app;
SET SCHEMA 'app';
ALTER TABLE transactions
    ADD COLUMN account_id text;
UPDATE transactions
    SET (account_id) = ROW(signer_address);
ALTER TABLE transactions
    ALTER  COLUMN account_id SET NOT NULL;

--
-- Name: transactions_account_id; Type: INDEX; Schema: app; Owner: subquery
--

CREATE INDEX transactions_account_id ON app.transactions USING hash (account_id);
--
-- Name: transactions transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: subquery
--

ALTER TABLE ONLY app.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES app.accounts(id) ON UPDATE CASCADE;


--
-- Name: CONSTRAINT transactions_account_id_fkey ON transactions; Type: COMMENT; Schema: app; Owner: subquery
--

COMMENT ON CONSTRAINT transactions_account_id_fkey ON app.transactions IS '@foreignFieldName transactions';
