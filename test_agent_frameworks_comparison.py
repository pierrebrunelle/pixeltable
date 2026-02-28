"""
Multi-framework agent loop comparison.
Tests: Pixeltable vs LangGraph vs PydanticAI vs OpenAI Agents SDK

Scenario: sequential multi-turn tool calls where each step depends on the previous.
  1. lookup_ticker(company) -> ticker symbol
  2. stock_price(ticker)    -> price  (needs ticker from step 1)
  3. company_hq(ticker)     -> city   (needs ticker from step 1)
  4. weather(city)           -> forecast (needs city from step 3)

The LLM cannot skip steps because tool results feed into subsequent tool inputs.
"""

import os
import time
from dataclasses import dataclass

os.environ.setdefault('OPENAI_API_KEY', os.environ.get('OPENAI_API_KEY', ''))

MODEL = 'gpt-4o-mini'
MAX_ITERATIONS = 10

SYSTEM_PROMPT = 'You are a helpful assistant. Always use the tools provided. Follow any instructions about tool usage order.'

PROMPTS = [
    # Forces: lookup_ticker -> stock_price (2 turns minimum)
    'What is the current stock price of the company called "NVIDIA"? '
    'You must use lookup_ticker first to get the ticker symbol, then stock_price.',

    # Forces: lookup_ticker -> company_hq -> weather (3 turns minimum)
    'What is the weather at the headquarters of the company called "NVIDIA"? '
    'You must use lookup_ticker, then company_hq, then weather, in that order.',

    # Forces: lookup_ticker -> stock_price AND company_hq -> weather (2-3 turns, parallelism possible)
    'Tell me both the stock price and the weather at the HQ of the company called "NVIDIA". '
    'Use lookup_ticker first, then use the other tools.',

    # No tools needed
    'What is the capital of France?',
]

PROMPT_LABELS = [
    '2-step sequential (ticker->price)',
    '3-step sequential (ticker->hq->weather)',
    'Mixed parallel+sequential',
    'No tools needed',
]

# ---------------------------------------------------------------------------
# Shared tool implementations (pure Python)
# ---------------------------------------------------------------------------
COMPANY_DB = {
    'NVIDIA': {'ticker': 'NVDA', 'hq': 'Santa Clara'},
    'APPLE': {'ticker': 'AAPL', 'hq': 'Cupertino'},
    'MICROSOFT': {'ticker': 'MSFT', 'hq': 'Redmond'},
}
STOCK_DB = {'NVDA': 131.17, 'AAPL': 178.72, 'MSFT': 374.58}
WEATHER_DB = {
    'Santa Clara': 'Sunny, 72F',
    'Cupertino': 'Partly cloudy, 68F',
    'Redmond': 'Rainy, 52F',
}


def _lookup_ticker(company_name: str) -> str:
    key = company_name.upper()
    if key in COMPANY_DB:
        return COMPANY_DB[key]['ticker']
    return f'Unknown company: {company_name}'


def _stock_price(ticker: str) -> float:
    return STOCK_DB.get(ticker.upper(), 0.0)


def _company_hq(ticker: str) -> str:
    for info in COMPANY_DB.values():
        if info['ticker'] == ticker.upper():
            return info['hq']
    return f'Unknown ticker: {ticker}'


def _weather(city: str) -> str:
    return WEATHER_DB.get(city, f'No data for {city}')


@dataclass
class RunResult:
    framework: str
    prompt_label: str
    prompt: str
    iterations: int      # number of LLM turns that produced tool calls
    tool_calls: int      # total individual tool invocations
    tool_names: list[str]
    tool_results: list[str]
    final_answer: str
    elapsed_s: float
    error: str | None = None


# ===================================================================
# PIXELTABLE
# ===================================================================

def run_pixeltable() -> list[RunResult]:
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tests'))

    import pixeltable as pxt
    from pixeltable.functions.openai import chat_completions
    from functions.multi_turn_tools import company_hq, lookup_ticker, stock_price, weather

    pxt.drop_dir('bench', force=True, if_not_exists='ignore')
    pxt.create_dir('bench', if_exists='ignore')
    t = pxt.create_table('bench.pxt_test', {'prompt': pxt.String}, if_exists='replace')

    tools = pxt.tools(lookup_ticker, stock_price, company_hq, weather)
    messages = [
        {'role': 'system', 'content': SYSTEM_PROMPT},
        {'role': 'user', 'content': t.prompt},
    ]
    t.add_computed_column(
        response=chat_completions(messages, model=MODEL, tools=tools, max_tool_iterations=MAX_ITERATIONS)
    )

    results = []
    for i, prompt in enumerate(PROMPTS):
        start = time.time()
        t.insert(prompt=prompt)
        elapsed = time.time() - start

        row = t.where(t.prompt == prompt).select(t.response).collect()
        resp = row['response'][0]

        history = resp.get('tool_calls_history', [])
        iterations = resp.get('iterations', 0)
        final_text = resp['choices'][0]['message'].get('content', '') or ''

        results.append(RunResult(
            framework='Pixeltable',
            prompt_label=PROMPT_LABELS[i],
            prompt=prompt,
            iterations=iterations,
            tool_calls=len(history),
            tool_names=[h['tool_name'] for h in history],
            tool_results=[h['result'] for h in history],
            final_answer=final_text[:300],
            elapsed_s=round(elapsed, 2),
        ))
    return results


# ===================================================================
# LANGGRAPH
# ===================================================================

def run_langgraph() -> list[RunResult]:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_core.tools import tool as lc_tool
    from langchain_openai import ChatOpenAI
    from langgraph.prebuilt import create_react_agent

    @lc_tool
    def lookup_ticker(company_name: str) -> str:
        """Look up the stock ticker symbol for a company by its name.

        Args:
            company_name: The name of the company to look up.
        """
        return _lookup_ticker(company_name)

    @lc_tool
    def stock_price(ticker: str) -> float:
        """Get the current stock price for a ticker symbol.

        Args:
            ticker: The ticker symbol to look up.
        """
        return _stock_price(ticker)

    @lc_tool
    def company_hq(ticker: str) -> str:
        """Get the headquarters city for a company given its ticker symbol.

        Args:
            ticker: The ticker symbol of the company.
        """
        return _company_hq(ticker)

    @lc_tool
    def weather(city: str) -> str:
        """Get the current weather forecast for a city.

        Args:
            city: The name of the city.
        """
        return _weather(city)

    llm = ChatOpenAI(model=MODEL)
    agent = create_react_agent(llm, [lookup_ticker, stock_price, company_hq, weather])

    results = []
    for i, prompt in enumerate(PROMPTS):
        start = time.time()
        response = agent.invoke(
            {'messages': [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ]},
            config={'recursion_limit': MAX_ITERATIONS * 3},
        )
        elapsed = time.time() - start

        all_msgs = response['messages']
        tool_calls_made = []
        tool_results_list = []
        iterations = 0
        for msg in all_msgs:
            # AIMessage with tool_calls = one iteration
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                iterations += 1
                for tc in msg.tool_calls:
                    tool_calls_made.append(tc['name'])
            # ToolMessage = tool result
            if msg.type == 'tool':
                tool_results_list.append(msg.content)

        final_text = all_msgs[-1].content if all_msgs else ''

        results.append(RunResult(
            framework='LangGraph',
            prompt_label=PROMPT_LABELS[i],
            prompt=prompt,
            iterations=iterations,
            tool_calls=len(tool_calls_made),
            tool_names=tool_calls_made,
            tool_results=tool_results_list,
            final_answer=(final_text or '')[:300],
            elapsed_s=round(elapsed, 2),
        ))
    return results


# ===================================================================
# PYDANTIC AI
# ===================================================================

def run_pydantic_ai() -> list[RunResult]:
    from pydantic_ai import Agent
    from pydantic_ai.models.openai import OpenAIModel

    model = OpenAIModel(MODEL)
    agent = Agent(model, system_prompt=SYSTEM_PROMPT)

    @agent.tool_plain
    def lookup_ticker(company_name: str) -> str:
        """Look up the stock ticker symbol for a company by its name."""
        return _lookup_ticker(company_name)

    @agent.tool_plain
    def stock_price(ticker: str) -> float:
        """Get the current stock price for a ticker symbol."""
        return _stock_price(ticker)

    @agent.tool_plain
    def company_hq(ticker: str) -> str:
        """Get the headquarters city for a company given its ticker symbol."""
        return _company_hq(ticker)

    @agent.tool_plain
    def weather(city: str) -> str:
        """Get the current weather forecast for a city."""
        return _weather(city)

    results = []
    for i, prompt in enumerate(PROMPTS):
        start = time.time()
        try:
            result = agent.run_sync(prompt)
            elapsed = time.time() - start

            tool_calls_made = []
            tool_results_list = []
            iterations = 0

            # PydanticAI message structure:
            #   ModelResponse with parts[].part_kind == 'tool-call' -> one iteration
            #   ModelRequest with parts[].part_kind == 'tool-return' -> tool results
            for msg in result.all_messages():
                has_tool_call = False
                for part in msg.parts:
                    if part.part_kind == 'tool-call':
                        tool_calls_made.append(part.tool_name)
                        has_tool_call = True
                    elif part.part_kind == 'tool-return':
                        tool_results_list.append(str(part.content))
                if has_tool_call:
                    iterations += 1

            results.append(RunResult(
                framework='PydanticAI',
                prompt_label=PROMPT_LABELS[i],
                prompt=prompt,
                iterations=iterations,
                tool_calls=len(tool_calls_made),
                tool_names=tool_calls_made,
                tool_results=tool_results_list,
                final_answer=(result.output or '')[:300],
                elapsed_s=round(elapsed, 2),
            ))
        except Exception as e:
            import traceback
            traceback.print_exc()
            elapsed = time.time() - start
            results.append(RunResult(
                framework='PydanticAI',
                prompt_label=PROMPT_LABELS[i],
                prompt=prompt,
                iterations=0, tool_calls=0, tool_names=[], tool_results=[],
                final_answer='', elapsed_s=round(elapsed, 2), error=str(e)[:200],
            ))
    return results


# ===================================================================
# OPENAI AGENTS SDK
# ===================================================================

def run_openai_agents() -> list[RunResult]:
    from agents import Agent, Runner, function_tool

    @function_tool
    def lookup_ticker(company_name: str) -> str:
        """Look up the stock ticker symbol for a company by its name."""
        return _lookup_ticker(company_name)

    @function_tool
    def stock_price(ticker: str) -> str:
        """Get the current stock price for a ticker symbol."""
        return str(_stock_price(ticker))

    @function_tool
    def company_hq(ticker: str) -> str:
        """Get the headquarters city for a company given its ticker symbol."""
        return _company_hq(ticker)

    @function_tool
    def weather(city: str) -> str:
        """Get the current weather forecast for a city."""
        return _weather(city)

    agent = Agent(
        name='benchmark_agent',
        model=MODEL,
        instructions=SYSTEM_PROMPT,
        tools=[lookup_ticker, stock_price, company_hq, weather],
    )

    results = []
    for i, prompt in enumerate(PROMPTS):
        start = time.time()
        try:
            result = Runner.run_sync(agent, prompt, max_turns=MAX_ITERATIONS)
            elapsed = time.time() - start

            tool_calls_made = []
            tool_results_list = []
            iterations = 0

            # OpenAI Agents SDK: raw_responses is list[ModelResponse]
            # Each ModelResponse.output is list of typed objects:
            #   - ResponseFunctionToolCall (type='function_call', .name, .call_id, .arguments)
            #   - ResponseOutputMessage (type='message', .content)
            for resp in result.raw_responses:
                has_tool_call = False
                for output_item in resp.output:
                    if output_item.type == 'function_call':
                        tool_calls_made.append(output_item.name)
                        has_tool_call = True
                if has_tool_call:
                    iterations += 1

            # Collect tool results from new_items (ToolCallOutputItem)
            for item in result.new_items:
                if item.type == 'tool_call_output_item':
                    raw = item.raw_item
                    if isinstance(raw, dict):
                        tool_results_list.append(str(raw.get('output', '')))
                    elif hasattr(raw, 'output'):
                        tool_results_list.append(str(raw.output))

            final_text = result.final_output or ''

            results.append(RunResult(
                framework='OpenAI Agents',
                prompt_label=PROMPT_LABELS[i],
                prompt=prompt,
                iterations=iterations,
                tool_calls=len(tool_calls_made),
                tool_names=tool_calls_made,
                tool_results=tool_results_list,
                final_answer=final_text[:300],
                elapsed_s=round(elapsed, 2),
            ))
        except Exception as e:
            import traceback
            traceback.print_exc()
            elapsed = time.time() - start
            results.append(RunResult(
                framework='OpenAI Agents',
                prompt_label=PROMPT_LABELS[i],
                prompt=prompt,
                iterations=0, tool_calls=0, tool_names=[], tool_results=[],
                final_answer='', elapsed_s=round(elapsed, 2), error=str(e)[:200],
            ))
    return results


# ===================================================================
# COMPARISON OUTPUT
# ===================================================================

def print_comparison(all_results: dict[str, list[RunResult]]) -> None:
    frameworks = list(all_results.keys())
    n_prompts = len(PROMPTS)
    col_w = 22

    print('\n' + '=' * 120)
    print('MULTI-FRAMEWORK AGENT LOOP COMPARISON (Multi-Turn Scenarios)')
    print(f'Model: {MODEL} | Max iterations: {MAX_ITERATIONS}')
    print('=' * 120)

    for i in range(n_prompts):
        print(f'\n{"─" * 120}')
        print(f'SCENARIO: {PROMPT_LABELS[i]}')
        print(f'{"─" * 120}')

        header = f'  {"Metric":<20s}'
        for fw in frameworks:
            header += f' {fw:>{col_w}s}'
        print(header)
        print(f'  {"─" * 20}' + (f' {"─" * col_w}' * len(frameworks)))

        for label, getter in [
            ('Iterations', lambda r: str(r.iterations) if not r.error else 'ERROR'),
            ('Tool calls', lambda r: str(r.tool_calls) if not r.error else 'ERROR'),
            ('Time (s)', lambda r: f'{r.elapsed_s:.2f}'),
        ]:
            row = f'  {label:<20s}'
            for fw in frameworks:
                row += f' {getter(all_results[fw][i]):>{col_w}s}'
            print(row)

        # Full tool sequence
        row = f'  {"Tool sequence":<20s}'
        for fw in frameworks:
            r = all_results[fw][i]
            seq = '->'.join(r.tool_names) if r.tool_names else '(none)'
            if len(seq) > col_w:
                seq = seq[:col_w - 2] + '..'
            row += f' {seq:>{col_w}s}'
        print(row)

        print()
        for fw in frameworks:
            r = all_results[fw][i]
            if r.error:
                print(f'  {fw:14s} ERROR: {r.error[:100]}')
            else:
                answer = r.final_answer.replace('\n', ' ')[:100]
                print(f'  {fw:14s} answer: {answer}')

        # Tool results (verify correctness)
        print()
        for fw in frameworks:
            r = all_results[fw][i]
            if r.tool_results:
                print(f'  {fw:14s} tool results: {r.tool_results}')

    # Summary
    print(f'\n{"=" * 120}')
    print('AGGREGATE SUMMARY')
    print(f'{"=" * 120}')

    header = f'  {"Metric":<25s}'
    for fw in frameworks:
        header += f' {fw:>{col_w}s}'
    print(header)
    print(f'  {"─" * 25}' + (f' {"─" * col_w}' * len(frameworks)))

    for label, getter in [
        ('Total iterations', lambda rs: sum(r.iterations for r in rs if not r.error)),
        ('Total tool calls', lambda rs: sum(r.tool_calls for r in rs if not r.error)),
        ('Total time (s)', lambda rs: round(sum(r.elapsed_s for r in rs), 2)),
        ('Avg time/prompt (s)', lambda rs: round(sum(r.elapsed_s for r in rs) / n_prompts, 2)),
        ('Errors', lambda rs: sum(1 for r in rs if r.error)),
    ]:
        row = f'  {label:<25s}'
        for fw in frameworks:
            val = getter(all_results[fw])
            row += f' {val:>{col_w}}'
        print(row)

    # Full tool call sequence comparison
    print(f'\n{"─" * 120}')
    print('TOOL CALL SEQUENCES (verify all frameworks agree)')
    print(f'{"─" * 120}')
    for i in range(n_prompts):
        print(f'\n  {PROMPT_LABELS[i]}:')
        for fw in frameworks:
            r = all_results[fw][i]
            if r.error:
                print(f'    {fw:15s}: ERROR')
            else:
                seq = ' -> '.join(r.tool_names) if r.tool_names else '(no tools)'
                print(f'    {fw:15s}: {seq}  [{r.iterations} iters, {r.tool_calls} calls, {r.elapsed_s:.2f}s]')

        # Check agreement
        seqs = [tuple(all_results[fw][i].tool_names) for fw in frameworks if not all_results[fw][i].error]
        if len(set(seqs)) == 1:
            print(f'    --> ALL MATCH')
        else:
            print(f'    --> MISMATCH: {seqs}')


if __name__ == '__main__':
    all_results: dict[str, list[RunResult]] = {}

    for name, runner in [
        ('LangGraph', run_langgraph),
        ('PydanticAI', run_pydantic_ai),
        ('OpenAI Agents', run_openai_agents),
        ('Pixeltable', run_pixeltable),
    ]:
        print(f'\n{"=" * 60}')
        print(f'Running {name}...')
        print(f'{"=" * 60}')
        all_results[name] = runner()

    print_comparison(all_results)
