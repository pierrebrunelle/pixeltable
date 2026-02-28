import asyncio
import json
import logging
import uuid
from typing import TYPE_CHECKING, Any, Callable, ClassVar, TypeVar

import pydantic

from pixeltable import exceptions as excs, type_system as ts

from .function import Function
from .signature import Parameter
from .udf import udf

if TYPE_CHECKING:
    from pixeltable import exprs

_logger = logging.getLogger(__name__)

# The Tool and Tools classes are containers that hold Pixeltable UDFs and related metadata, so that they can be
# realized as LLM tools. They are implemented as Pydantic models in order to provide a canonical way of converting
# to JSON, via the Pydantic `model_serializer` interface. In this way, they can be passed directly as UDF
# parameters as described in the `pixeltable.tools` and `pixeltable.tool` docstrings.
#
# (The dataclass dict serializer is insufficiently flexible for this purpose: `Tool` contains a member of type
# `Function`, which is not natively JSON-serializable; Pydantic provides a way of customizing its default
# serialization behavior, whereas dataclasses do not.)


class Tool(pydantic.BaseModel):
    # Allow arbitrary types so that we can include a Pixeltable function in the schema.
    # We will implement a model_serializer to ensure the Tool model can be serialized.
    model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

    fn: Function
    name: str | None = None
    description: str | None = None

    @property
    def parameters(self) -> dict[str, Parameter]:
        return self.fn.signature.parameters

    @pydantic.model_serializer
    def ser_model(self) -> dict[str, Any]:
        return {
            'name': self.name or self.fn.name,
            'description': self.description or self.fn.comment(),
            'parameters': {
                'type': 'object',
                'properties': {param.name: param.col_type._to_json_schema() for param in self.parameters.values()},
            },
            'required': [param.name for param in self.parameters.values() if not param.col_type.nullable],
            'additionalProperties': False,  # TODO Handle kwargs?
        }

    # The output of `tool_calls` must be a dict in standardized tool invocation format:
    # {tool_name: [{'args': {name1: value1, name2: value2, ...}}, ...], ...}
    def invoke(self, tool_calls: 'exprs.Expr') -> 'exprs.Expr':
        import pixeltable.functions as pxtf

        func_name = self.name or self.fn.name
        return pxtf.map(tool_calls[func_name]['*'], lambda x: self.__invoke_kwargs(x.args))

    def __invoke_kwargs(self, kwargs: 'exprs.Expr') -> 'exprs.FunctionCall':
        kwargs = {param.name: self.__extract_tool_arg(param, kwargs) for param in self.parameters.values()}
        return self.fn(**kwargs)

    def __extract_tool_arg(self, param: Parameter, kwargs: 'exprs.Expr') -> 'exprs.FunctionCall':
        if param.col_type.is_string_type():
            return _extract_str_tool_arg(kwargs, param_name=param.name)
        if param.col_type.is_int_type():
            return _extract_int_tool_arg(kwargs, param_name=param.name)
        if param.col_type.is_float_type():
            return _extract_float_tool_arg(kwargs, param_name=param.name)
        if param.col_type.is_bool_type():
            return _extract_bool_tool_arg(kwargs, param_name=param.name)
        if param.col_type.is_json_type():
            return _extract_json_tool_arg(kwargs, param_name=param.name)
        if param.col_type.is_uuid_type():
            return _extract_uuid_tool_arg(kwargs, param_name=param.name)
        raise AssertionError(param.col_type)


class ToolChoice(pydantic.BaseModel):
    auto: bool
    required: bool
    tool: str | None
    parallel_tool_calls: bool


class Tools(pydantic.BaseModel):
    tools: list[Tool]

    _registry: ClassVar[dict[str, 'Tools']] = {}
    _registry_id: str = pydantic.PrivateAttr(default_factory=lambda: str(uuid.uuid4()))

    def model_post_init(self, _context: Any, /) -> None:
        Tools._registry[self._registry_id] = self

    @pydantic.model_serializer
    def ser_model(self) -> list[dict[str, Any]]:
        result = [tool.ser_model() for tool in self.tools]
        result.append({'_pxt_tools_id': self._registry_id})
        return result

    @classmethod
    def from_registry(cls, tools_data: list[dict[str, Any]]) -> 'Tools | None':
        """Retrieve the Tools object from the registry using the embedded ID in serialized tools data."""
        for item in tools_data:
            if '_pxt_tools_id' in item:
                return cls._registry.get(item['_pxt_tools_id'])
        return None

    def _get_tool_by_name(self, name: str) -> Tool | None:
        for tool in self.tools:
            if (tool.name or tool.fn.name) == name:
                return tool
        return None

    def execute_tool(self, tool_name: str, args: dict[str, Any]) -> Any:
        """Execute a tool's underlying Python function directly at runtime.

        This bypasses the expression-level invocation and calls the function directly,
        enabling tool execution inside an agent loop within a UDF.
        """
        tool = self._get_tool_by_name(tool_name)
        if tool is None:
            raise excs.Error(f'Tool not found: {tool_name}')

        from .callable_function import CallableFunction
        assert isinstance(tool.fn, CallableFunction)

        typed_args: dict[str, Any] = {}
        for param in tool.parameters.values():
            if param.name in args:
                typed_args[param.name] = args[param.name]

        if tool.fn.is_async:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            if loop is not None and loop.is_running():
                return loop.run_until_complete(tool.fn.aexec(**typed_args))
            else:
                return asyncio.run(tool.fn.aexec(**typed_args))
        else:
            return tool.fn.exec([], typed_args)

    # `tool_calls` must be in standardized tool invocation format:
    # {tool_name: {'args': {name1: value1, name2: value2, ...}}, ...}
    def _invoke(self, tool_calls: 'exprs.Expr') -> 'exprs.InlineDict':
        from pixeltable import exprs

        return exprs.InlineDict({tool.name or tool.fn.name: tool.invoke(tool_calls) for tool in self.tools})

    def choice(
        self,
        auto: bool = False,
        required: bool = False,
        tool: str | Function | None = None,
        parallel_tool_calls: bool = True,
    ) -> ToolChoice:
        if sum([auto, required, tool is not None]) != 1:
            raise excs.Error('Exactly one of `auto`, `required`, or `tool` must be specified.')
        tool_name: str | None = None
        if tool is not None:
            try:
                tool_obj = next(
                    t
                    for t in self.tools
                    if (isinstance(tool, Function) and t.fn == tool)
                    or (isinstance(tool, str) and (t.name or t.fn.name) == tool)
                )
                tool_name = tool_obj.name or tool_obj.fn.name
            except StopIteration:
                raise excs.Error(f'That tool is not in the specified list of tools: {tool}') from None
        return ToolChoice(auto=auto, required=required, tool=tool_name, parallel_tool_calls=parallel_tool_calls)


@udf
def _extract_str_tool_arg(kwargs: dict[str, Any], param_name: str) -> str | None:
    return _extract_arg(str, kwargs, param_name)


@udf
def _extract_int_tool_arg(kwargs: dict[str, Any], param_name: str) -> int | None:
    return _extract_arg(int, kwargs, param_name)


@udf
def _extract_float_tool_arg(kwargs: dict[str, Any], param_name: str) -> float | None:
    return _extract_arg(float, kwargs, param_name)


@udf
def _extract_bool_tool_arg(kwargs: dict[str, Any], param_name: str) -> bool | None:
    return _extract_arg(bool, kwargs, param_name)


@udf
def _extract_json_tool_arg(kwargs: dict[str, Any], param_name: str) -> ts.Json | None:
    if param_name in kwargs:
        return json.loads(kwargs[param_name])
    return None


@udf
def _extract_uuid_tool_arg(kwargs: dict[str, Any], param_name: str) -> uuid.UUID | None:
    return _extract_arg(uuid.UUID, kwargs, param_name)


T = TypeVar('T')


def _extract_arg(eval_fn: Callable[[Any], T], kwargs: dict[str, Any], param_name: str) -> T | None:
    if param_name in kwargs:
        return eval_fn(kwargs[param_name])
    return None
