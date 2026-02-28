"""Tests for the agent loop (max_tool_iterations) feature in chat_completions and messages UDFs."""

import pytest

import pixeltable as pxt
from tests.utils import skip_test_if_no_client, skip_test_if_not_installed

from .tool_utils import stock_price, weather


@pytest.mark.remote_api
class TestOpenAIAgentLoop:
    def test_single_tool_loop(self, uses_db: None) -> None:
        skip_test_if_not_installed('openai')
        skip_test_if_no_client('openai')
        from pixeltable.functions.openai import chat_completions

        t = pxt.create_table('test_agent_loop', {'prompt': pxt.String})
        tools = pxt.tools(stock_price)
        messages = [
            {'role': 'system', 'content': 'You are a helpful assistant. Use the tools available to answer questions.'},
            {'role': 'user', 'content': t.prompt},
        ]
        t.add_computed_column(
            response=chat_completions(messages, model='gpt-4o-mini', tools=tools, max_tool_iterations=5)
        )
        t.insert(prompt='What is the stock price of NVDA today?')
        res = t.select(t.response).head()

        response = res[0]['response']
        assert 'tool_calls_history' in response
        assert 'iterations' in response
        assert response['iterations'] > 0
        assert len(response['tool_calls_history']) > 0

        first_call = response['tool_calls_history'][0]
        assert first_call['tool_name'] == 'stock_price'
        assert first_call['tool_call_id'] is not None
        assert first_call['error'] is None
        assert '131.17' in first_call['result']

        final_msg = response['choices'][0]['message']['content']
        assert final_msg is not None
        assert '131' in final_msg

    def test_multiple_tools_loop(self, uses_db: None) -> None:
        skip_test_if_not_installed('openai')
        skip_test_if_no_client('openai')
        from pixeltable.functions.openai import chat_completions

        t = pxt.create_table('test_multi_tool', {'prompt': pxt.String})
        tools = pxt.tools(stock_price, weather)
        messages = [
            {'role': 'system', 'content': 'You are a helpful assistant. Use tools to answer questions.'},
            {'role': 'user', 'content': t.prompt},
        ]
        t.add_computed_column(
            response=chat_completions(messages, model='gpt-4o-mini', tools=tools, max_tool_iterations=5)
        )
        t.insert(prompt='What is the stock price of NVDA and the weather in San Francisco?')
        res = t.select(t.response).head()

        response = res[0]['response']
        assert 'tool_calls_history' in response
        history = response['tool_calls_history']
        tool_names = {h['tool_name'] for h in history}
        assert 'stock_price' in tool_names
        assert 'weather' in tool_names

        final_msg = response['choices'][0]['message']['content']
        assert final_msg is not None

    def test_no_tools_needed(self, uses_db: None) -> None:
        """When the LLM doesn't need tools, the loop should not execute."""
        skip_test_if_not_installed('openai')
        skip_test_if_no_client('openai')
        from pixeltable.functions.openai import chat_completions

        t = pxt.create_table('test_no_tools', {'prompt': pxt.String})
        tools = pxt.tools(stock_price)
        messages = [
            {'role': 'user', 'content': t.prompt},
        ]
        t.add_computed_column(
            response=chat_completions(messages, model='gpt-4o-mini', tools=tools, max_tool_iterations=5)
        )
        t.insert(prompt='What is 2 + 2?')
        res = t.select(t.response).head()

        response = res[0]['response']
        assert 'tool_calls_history' in response
        assert response['iterations'] == 0
        assert len(response['tool_calls_history']) == 0
        assert response['choices'][0]['message']['content'] is not None

    def test_max_iterations_boundary(self, uses_db: None) -> None:
        """Verify that max_tool_iterations=1 limits to exactly one tool-calling round."""
        skip_test_if_not_installed('openai')
        skip_test_if_no_client('openai')
        from pixeltable.functions.openai import chat_completions

        t = pxt.create_table('test_max_iter', {'prompt': pxt.String})
        tools = pxt.tools(stock_price, weather)
        messages = [
            {'role': 'system', 'content': 'You must call both stock_price and weather tools.'},
            {'role': 'user', 'content': t.prompt},
        ]
        t.add_computed_column(
            response=chat_completions(messages, model='gpt-4o-mini', tools=tools, max_tool_iterations=1)
        )
        t.insert(prompt='What is the stock price of NVDA and the weather in San Francisco?')
        res = t.select(t.response).head()

        response = res[0]['response']
        assert response['iterations'] <= 1

    def test_backward_compat_no_max_iterations(self, uses_db: None) -> None:
        """Without max_tool_iterations, behavior should be identical to the existing UDF."""
        skip_test_if_not_installed('openai')
        skip_test_if_no_client('openai')
        from pixeltable.functions.openai import chat_completions, invoke_tools

        t = pxt.create_table('test_compat', {'prompt': pxt.String})
        tools = pxt.tools(stock_price)
        messages = [{'role': 'user', 'content': t.prompt}]
        t.add_computed_column(response=chat_completions(messages, model='gpt-4o-mini', tools=tools))
        t.add_computed_column(tool_calls=invoke_tools(tools, t.response))
        t.insert(prompt='What is the stock price of NVDA?')
        res = t.select(t.response, t.tool_calls).head()

        assert 'tool_calls_history' not in res[0]['response']
        assert res[0]['tool_calls'] == {'stock_price': [131.17]}


@pytest.mark.remote_api
class TestAnthropicAgentLoop:
    def test_single_tool_loop(self, uses_db: None) -> None:
        skip_test_if_not_installed('anthropic')
        skip_test_if_no_client('anthropic')
        from pixeltable.functions.anthropic import messages as anthropic_messages

        t = pxt.create_table('test_anthropic_loop', {'prompt': pxt.String})
        tools = pxt.tools(stock_price)
        msgs = [
            {'role': 'user', 'content': t.prompt},
        ]
        t.add_computed_column(
            response=anthropic_messages(
                msgs, model='claude-3-5-haiku-20241022', max_tokens=1024, tools=tools, max_tool_iterations=5
            )
        )
        t.insert(prompt='What is the stock price of NVDA today?')
        res = t.select(t.response).head()

        response = res[0]['response']
        assert 'tool_calls_history' in response
        assert response['iterations'] > 0
        assert len(response['tool_calls_history']) > 0

        first_call = response['tool_calls_history'][0]
        assert first_call['tool_name'] == 'stock_price'
        assert first_call['tool_call_id'] is not None
        assert first_call['error'] is None


class TestToolsRegistry:
    """Unit tests for the Tools registry mechanism (no API calls needed)."""

    def test_tools_registry(self) -> None:
        from pixeltable.func.tools import Tools

        tools = pxt.tools(stock_price, weather)
        serialized = tools.model_dump()
        assert isinstance(serialized, list)

        pxt_id_items = [item for item in serialized if '_pxt_tools_id' in item]
        assert len(pxt_id_items) == 1

        retrieved = Tools.from_registry(serialized)
        assert retrieved is tools

    def test_tool_execute(self) -> None:
        tools = pxt.tools(stock_price, weather)
        result = tools.execute_tool('stock_price', {'ticker': 'NVDA'})
        assert result == 131.17

        result = tools.execute_tool('weather', {'city': 'San Francisco'})
        assert result == 'Cloudy with a chance of meatballs'

    def test_tool_execute_not_found(self) -> None:
        tools = pxt.tools(stock_price)
        with pytest.raises(pxt.exceptions.Error, match='Tool not found'):
            tools.execute_tool('nonexistent', {})

    def test_serialization_backward_compat(self) -> None:
        """The _pxt_tools_id marker should not interfere with tool schema extraction."""
        tools = pxt.tools(stock_price)
        serialized = tools.model_dump()
        api_tools = [item for item in serialized if '_pxt_tools_id' not in item]
        assert len(api_tools) == 1
        assert api_tools[0]['name'] == 'stock_price'
        assert 'parameters' in api_tools[0]
