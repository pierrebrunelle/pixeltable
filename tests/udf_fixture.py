import pixeltable as pxt


@pxt.udf
def decorate(text: str, prefix: str) -> str:
    return prefix + text


@pxt.udf
def constant() -> int:
    return 42
