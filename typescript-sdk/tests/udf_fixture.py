import itertools

import numpy as np

import pixeltable as pxt


@pxt.udf
def decorate(text: str, prefix: str) -> str:
    return prefix + text


@pxt.udf
def constant() -> int:
    return 42


@pxt.udf
def text_embedding(text: str) -> pxt.Array[(3,), pxt.Float]:
    return np.array([text.count('a'), text.count('b'), 1], dtype=np.float32)


@pxt.udf
def array_total(values: pxt.Array[(2, 2), pxt.Float]) -> float:
    return float(values.sum())


@pxt.udf
def parse_number(text: str) -> int:
    return int(text)


_retry_attempts = itertools.count()


@pxt.udf
def retry_once(value: int) -> int:
    if next(_retry_attempts) == 0:
        raise ValueError('temporary fixture failure')
    return value * 2
