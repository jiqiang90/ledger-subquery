import unittest
from typing import List

from gql import gql

from src.genesis.helpers.field_enums import Contracts
from src.genesis.processing.contracts import ContractsManager
from tests.helpers.clients import TestWithDBConn, TestWithGQLClient
from tests.helpers.genesis_data import test_genesis_data, test_wasm_contracts_state


class TestAccountsManager(TestWithDBConn, TestWithGQLClient):
    test_manager: ContractsManager
    completed = False
    expected_accounts: List[dict] = [
        {
            "id": b["contract_address"],
            "interface": "Uncertain",
            "store_message_id": None,
            "instantiate_message_id": None,
        }
        for b in test_wasm_contracts_state
    ]

    @classmethod
    def setUpClass(cls):
        TestWithDBConn().setUpClass()
        TestWithGQLClient().setUpClass()
        cls.truncate_tables("contracts", cascade=True)

        cls.test_manager = ContractsManager(cls.db_conn)
        cls.test_manager.process_genesis(test_genesis_data)

    def test_sql_retrieval(self):
        actual_accounts: List[dict] = []

        with self.db_conn.cursor() as db:
            for row in db.execute(Contracts.select_query()).fetchall():
                actual_accounts.append(
                    {
                        "id": row[Contracts.id.value],
                        "interface": row[Contracts.interface.value],
                        "store_message_id": row[Contracts.store_message_id.value],
                        "instantiate_message_id": row[
                            Contracts.instantiate_message_id.value
                        ],
                    }
                )

        self.assertListEqual(self.expected_accounts, actual_accounts)

    def test_gql_retrieval(self):
        actual_accounts: List[dict] = []

        results = self.gql_client.execute(
            gql(
                """
            query {
                accounts {
                    nodes {
                        id,
                        chainId,
                    }
                }
            }
        """
            )
        )

        for node in results["accounts"]["nodes"]:
            actual_accounts.append(
                {"id": node.get("id"), "chain_id": node.get("chainId")}
            )

        self.assertListEqual(self.expected_accounts, actual_accounts)


if __name__ == "__main__":
    unittest.main()
