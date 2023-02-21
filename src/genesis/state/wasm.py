import time
from dataclasses import dataclass, field
from typing import Dict, List

from .utils import ListConstructorMixin, OwnAttrsMixin, list_field_with_default, Contract


# class ContractData(ListConstructorMixin):
#     contract_address: str = field(default_factory=str)
#     contract_info: Dict = field(default_factory=dict)
#     contract_state: List[Dict] = list_field_with_default(dict)


# class Contract(ContractData, ListConstructorMixin, OwnAttrsMixin):
#     interface: str = "Uncertain"
#     def __init__(self, **kwargs):
#         print("wasm.py:16 CONTRACT PRINT KWARGS INIT")
#         kwargs["coins"] = Coin.from_dict_list(kwargs.get("coins"))
#         print(kwargs.get('contract_address'))
#         super().__init__(**kwargs)


@dataclass(frozen=True)
class WasmStateData:
    codes: List[Dict] = list_field_with_default(dict)
    contracts: List[Contract] = list_field_with_default(Contract)
    gen_msgs: List[Dict] = list_field_with_default(dict)
    params: Dict = field(default_factory=dict)
    sequences: List[Dict] = list_field_with_default(dict)


class WasmState(OwnAttrsMixin, WasmStateData):
    def __init__(self, **kwargs):
        kwargs["contracts"] = Contract.from_dict_list(kwargs.get("contracts"))
        # for x in kwargs.get("contracts"):
        #     print(x.contract_address)
        super().__init__(**kwargs)
