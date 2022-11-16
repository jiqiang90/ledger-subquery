import json
import re

from gql import gql

json_keys_regex = re.compile('"(\w+)":')  # noqa: W605


def to_gql(obj):
    # NB: strip quotes from object keys
    return json_keys_regex.sub("\g<1>:", json.dumps(obj))  # noqa: W605


def test_filtered_query(root_entity, _filter, nodes_string):
    filter_string = to_gql(_filter)

    return gql(
        """
    query {
        """
        + root_entity
        + """ (filter: """
        + filter_string
        + """) {
            nodes """
        + nodes_string
        + """
        }
    }
    """
    )
