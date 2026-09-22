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
