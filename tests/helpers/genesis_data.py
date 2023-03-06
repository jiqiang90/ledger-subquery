from typing import Dict, List

test_bank_state_balances: List[Dict] = [
    {
        "address": "addr123",
        "coins": [
            {"amount": 123, "denom": "a-token"},
            {"amount": 456, "denom": "b-token"},
        ],
    },
    {
        "address": "addr456",
        "coins": [
            {"amount": 111, "denom": "a-token"},
            {"amount": 222, "denom": "b-token"},
        ],
    },
]

test_bank_state_supply: List[Dict] = [
    {"amount": "987", "denom": "a-token"},
    {"amount": "654", "denom": "b-token"},
]

test_bank_state: Dict = {
    "balances": test_bank_state_balances,
    "denom_metadata": [],
    "params": {},
    "supply": test_bank_state_supply,
}

test_wasm_contracts_state: List[Dict] = [
    {
        "contract_address": "fetch1qzgdkls8ey2phy3z055j42z3ednn8eflxjn5rqg0xm3yha4jwj8su83wv2",
        "contract_info": {
            "admin": "",
            "code_id": "120",
            "created": None,
            "creator": "fetch16xat59x6kelyn08tqmkn086lklnxsstshgrzx2",
            "extension": None,
            "ibc_port_id": "",
            "label": "PRE",
        },
        "contract_state": [],
    }
]

test_app_state: Dict = {
    "airdrop": {},
    "auth": {},
    "authz": {},
    "bank": test_bank_state,
    "capability": {},
    "crisis": {},
    "distribution": {},
    "evidence": {},
    "feegrant": {},
    "genutil": {},
    "gov": {},
    "ibc": {},
    "mint": {},
    "params": {},
    "slashing": {},
    "staking": {},
    "transfer": {},
    "upgrade": {},
    "vesting": {},
    "wasm": {"contracts": test_wasm_contracts_state},
}

test_genesis_data: Dict = {
    "app_hash": {},
    "app_state": test_app_state,
    "chain_id": "test",
    "consensus_params": {},
    "genesis_time": "",
    "initial_height": "",
    "validators": [],
}
