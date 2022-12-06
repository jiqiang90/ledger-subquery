import datetime as dt
import json
import sys
import time
import unittest
from pathlib import Path

from src.genesis.helpers.field_enums import ExecuteContractMessageFields
from tests.helpers.contracts import BridgeContract, DefaultBridgeContractConfig
from tests.helpers.entity_test import EntityTest
from tests.helpers.graphql import test_filtered_query

repo_root_path = Path(__file__).parent.parent.parent.absolute()
sys.path.insert(0, str(repo_root_path))


class TestContractExecution(EntityTest):
    amount = "10000"
    denom = "atestfet"
    method = "swap"

    _contract: BridgeContract

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.clean_db({"execute_contract_messages"})

        cls._contract = BridgeContract(
            cls.ledger_client, cls.validator_wallet, DefaultBridgeContractConfig
        )
        for i in range(3):  # enough entities are created to verify sorting
            resp = cls._contract.execute(
                {cls.method: {"destination": cls.validator_address}},
                cls.validator_wallet,
                funds=str(cls.amount) + cls.denom,
            )
            cls.ledger_client.wait_for_query_tx(resp.tx_hash)
        time.sleep(
            5
        )  # stil need to give some extra time for the indexer to pickup the tx

    def test_contract_execution(self):
        execMsgs = self.db_cursor.execute(
            ExecuteContractMessageFields.select_query()
        ).fetchone()
        self.assertIsNotNone(
            execMsgs, "\nDBError: table is empty - maybe indexer did not find an entry?"
        )
        self.assertEqual(
            execMsgs[ExecuteContractMessageFields.contract.value],
            self._contract.address,
            "\nDBError: contract address does not match",
        )
        self.assertEqual(
            execMsgs[ExecuteContractMessageFields.method.value],
            self.method,
            "\nDBError: contract method does not match",
        )
        self.assertEqual(
            execMsgs[ExecuteContractMessageFields.funds.value][0]["amount"],
            self.amount,
            "\nDBError: fund amount does not match",
        )
        self.assertEqual(
            execMsgs[ExecuteContractMessageFields.funds.value][0]["denom"],
            self.denom,
            "\nDBError: fund denomination does not match",
        )

    def test_contract_execution_retrieval(
        self,
    ):  # As of now, this test depends on the execution of the previous test in this class.
        latest_block_timestamp = self.get_latest_block_timestamp()
        # create a second timestamp for five minutes before
        min_timestamp = (
            latest_block_timestamp - dt.timedelta(minutes=5)
        ).isoformat()  # convert both to JSON ISO format
        max_timestamp = json.dumps(latest_block_timestamp.isoformat())

        contract_execution_messages_swap_nodes = """
            {
                id,
                message { id }
                transaction { id }
                block {
                    id
                    height
                }
                contract
                method
                funds
            }
            """

        def filtered_execute_contract_messages_query(_filter, order=""):
            return test_filtered_query(
                "executeContractMessages",
                _filter,
                contract_execution_messages_swap_nodes,
                _order=order,
            )

        order_by_block_height_asc = filtered_execute_contract_messages_query(
            {"block": {"height": {"greaterThanOrEqualTo": "0"}}},
            "EXECUTE_CONTRACT_MESSAGES_BY_BLOCK_HEIGHT_ASC",
        )

        order_by_block_height_desc = filtered_execute_contract_messages_query(
            {"block": {"height": {"greaterThanOrEqualTo": "0"}}},
            "EXECUTE_CONTRACT_MESSAGES_BY_BLOCK_HEIGHT_DESC",
        )

        # query execute contract messages, query related block and filter by timestamp, returning all within last five minutes
        query_get_by_range = filtered_execute_contract_messages_query(
            {
                "block": {
                    "timestamp": {
                        "greaterThanOrEqualTo": min_timestamp,
                        "lessThanOrEqualTo": max_timestamp,
                    }
                }
            }
        )

        # query execute contract messages, filter by contract method
        query_get_by_method = filtered_execute_contract_messages_query(
            {"method": {"equalTo": self.method}}
        )

        queries = [query_get_by_range, query_get_by_method]
        for query in queries:
            results = self.gql_client.execute(query)
            """
            ["executeContractMessages"]["nodes"][0] denotes the sequence of keys to access the message contents queried for above.
            This provides {"contract":contract address, "method":method, "funds":funds}
            which can be destructured for the values of interest.
            """
            execMsgs = results["executeContractMessages"]["nodes"]
            self.assertTrue(execMsgs, "\nGQLError: No results returned from query")
            self.assertEqual(
                execMsgs[0]["contract"],
                self._contract.address,
                "\nGQLError: contract address does not match",
            )
            self.assertEqual(
                execMsgs[0]["method"],
                self.method,
                "\nGQLError: contract method does not match",
            )
            self.assertEqual(
                int(execMsgs[0]["funds"][0]["amount"]),
                int(self.amount),
                "\nGQLError: fund amount does not match",
            )
            self.assertEqual(
                execMsgs[0]["funds"][0]["denom"],
                self.denom,
                "\nGQLError: fund denomination does not match",
            )

        for (name, query, orderAssert) in (
            (
                "order by block height ascending",
                order_by_block_height_asc,
                self.assertGreaterEqual,
            ),
            (
                "order by block height descending",
                order_by_block_height_desc,
                self.assertLessEqual,
            ),
        ):
            with self.subTest(name):
                result = self.gql_client.execute(query)
                execute_contract_messages = result["executeContractMessages"]["nodes"]
                last = execute_contract_messages[0]["block"]["height"]
                for entry in execute_contract_messages:
                    cur = entry["block"]["height"]
                    orderAssert(
                        cur, last, msg="OrderAssertError: order of objects is incorrect"
                    )
                    last = cur


if __name__ == "__main__":
    unittest.main()
