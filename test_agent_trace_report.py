"""
Generate a detailed markdown trace report comparing agent loop execution
across Pixeltable, LangGraph, PydanticAI, and OpenAI Agents SDK.

Captures every intermediate step: LLM inputs, tool call decisions,
tool execution results, and final answers.
"""

import json
import os
import time
from dataclasses import dataclass, field

os.environ.setdefault('OPENAI_API_KEY', os.environ.get('OPENAI_API_KEY', ''))

MODEL = 'gpt-4o-mini'
MAX_ITERATIONS = 10
SYSTEM_PROMPT = 'You are a helpful assistant. Always use the tools provided. Follow any instructions about tool usage order.'

PROMPTS = [
    'What is the current stock price of the company called "NVIDIA"? '
    'You must use lookup_ticker first to get the ticker symbol, then stock_price.',

    'What is the weather at the headquarters of the company called "NVIDIA"? '
    'You must use lookup_ticker, then company_hq, then weather, in that order.',

    'Tell me both the stock price and the weather at the HQ of the company called "NVIDIA". '
    'Use lookup_ticker first, then use the other tools.',

    'What is the capital of France?',
]

PROMPT_LABELS = [
    '2-step sequential (ticker->price)',
    '3-step sequential (ticker->hq->weather)',
    'Mixed parallel+sequential',
    'No tools needed',
]

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
class Step:
    step_type: str     # 'llm_call', 'tool_call', 'tool_result', 'final_answer'
    detail: str        # human-readable detail


@dataclass
class TraceResult:
    framework: str
    prompt_label: str
    prompt: str
    steps: list[Step] = field(default_factory=list)
    iterations: int = 0
    tool_calls: int = 0
    tool_names: list[str] = field(default_factory=list)
    tool_results: list[str] = field(default_factory=list)
    final_answer: str = ''
    elapsed_s: float = 0.0
    error: str | None = None


# ===================================================================
# PIXELTABLE
# ===================================================================

def trace_pixeltable() -> list[TraceResult]:
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tests'))

    import pixeltable as pxt
    from pixeltable.functions.openai import chat_completions
    from functions.multi_turn_tools import company_hq, lookup_ticker, stock_price, weather

    pxt.drop_dir('trace', force=True, if_not_exists='ignore')
    pxt.create_dir('trace', if_exists='ignore')
    t = pxt.create_table('trace.pxt_test', {'prompt': pxt.String}, if_exists='replace')

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

        tr = TraceResult(
            framework='Pixeltable',
            prompt_label=PROMPT_LABELS[i],
            prompt=prompt,
            iterations=iterations,
            tool_calls=len(history),
            tool_names=[h['tool_name'] for h in history],
            tool_results=[h['result'] for h in history],
            final_answer=final_text,
            elapsed_s=round(elapsed, 2),
        )

        # Reconstruct steps from tool_calls_history
        tr.steps.append(Step('input', f'System: {SYSTEM_PROMPT}'))
        tr.steps.append(Step('input', f'User: {prompt}'))

        prev_iter = -1
        for h in history:
            if h['iteration'] != prev_iter:
                prev_iter = h['iteration']
                tr.steps.append(Step('llm_call', f'LLM response (iteration {h["iteration"]}): decided to call tool(s)'))
            tr.steps.append(Step('tool_call', f'Tool call: {h["tool_name"]}({json.dumps(h["args"])})'))
            tr.steps.append(Step('tool_result', f'Tool result: {h["result"]}'))

        if final_text:
            tr.steps.append(Step('llm_call', 'LLM response (final): generated text answer'))
            tr.steps.append(Step('final_answer', f'Answer: {final_text}'))

        results.append(tr)
    return results


# ===================================================================
# LANGGRAPH
# ===================================================================

def trace_langgraph() -> list[TraceResult]:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_core.tools import tool as lc_tool
    from langchain_openai import ChatOpenAI
    from langgraph.prebuilt import create_react_agent

    @lc_tool
    def lookup_ticker(company_name: str) -> str:
        """Look up the stock ticker symbol for a company by its name.
        Args:
            company_name: The name of the company.
        """
        return _lookup_ticker(company_name)

    @lc_tool
    def stock_price(ticker: str) -> float:
        """Get the current stock price for a ticker symbol.
        Args:
            ticker: The ticker symbol.
        """
        return _stock_price(ticker)

    @lc_tool
    def company_hq(ticker: str) -> str:
        """Get the headquarters city for a company given its ticker symbol.
        Args:
            ticker: The ticker symbol.
        """
        return _company_hq(ticker)

    @lc_tool
    def weather(city: str) -> str:
        """Get the current weather forecast for a city.
        Args:
            city: The city name.
        """
        return _weather(city)

    llm = ChatOpenAI(model=MODEL)
    agent = create_react_agent(llm, [lookup_ticker, stock_price, company_hq, weather])

    results = []
    for i, prompt in enumerate(PROMPTS):
        start = time.time()
        response = agent.invoke(
            {'messages': [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]},
            config={'recursion_limit': MAX_ITERATIONS * 3},
        )
        elapsed = time.time() - start

        all_msgs = response['messages']
        tr = TraceResult(
            framework='LangGraph',
            prompt_label=PROMPT_LABELS[i],
            prompt=prompt,
            elapsed_s=round(elapsed, 2),
        )

        tr.steps.append(Step('input', f'System: {SYSTEM_PROMPT}'))
        tr.steps.append(Step('input', f'User: {prompt}'))

        iteration = 0
        for msg in all_msgs:
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                tr.steps.append(Step('llm_call', f'LLM response (iteration {iteration}): decided to call tool(s)'))
                tr.iterations += 1
                iteration += 1
                for tc in msg.tool_calls:
                    tr.tool_calls += 1
                    tr.tool_names.append(tc['name'])
                    tr.steps.append(Step('tool_call', f'Tool call: {tc["name"]}({json.dumps(tc["args"])})'))
            elif msg.type == 'tool':
                tr.tool_results.append(msg.content)
                tr.steps.append(Step('tool_result', f'Tool result: {msg.content}'))
            elif msg.type == 'ai' and not (hasattr(msg, 'tool_calls') and msg.tool_calls):
                if msg.content:
                    tr.final_answer = msg.content
                    tr.steps.append(Step('llm_call', 'LLM response (final): generated text answer'))
                    tr.steps.append(Step('final_answer', f'Answer: {msg.content}'))

        results.append(tr)
    return results


# ===================================================================
# PYDANTIC AI
# ===================================================================

def trace_pydantic_ai() -> list[TraceResult]:
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

            tr = TraceResult(
                framework='PydanticAI',
                prompt_label=PROMPT_LABELS[i],
                prompt=prompt,
                elapsed_s=round(elapsed, 2),
            )

            tr.steps.append(Step('input', f'System: {SYSTEM_PROMPT}'))
            tr.steps.append(Step('input', f'User: {prompt}'))

            iteration = 0
            for msg in result.all_messages():
                has_tool_call = False
                for part in msg.parts:
                    if part.part_kind == 'tool-call':
                        if not has_tool_call:
                            tr.steps.append(Step('llm_call', f'LLM response (iteration {iteration}): decided to call tool(s)'))
                            tr.iterations += 1
                            iteration += 1
                            has_tool_call = True
                        tr.tool_calls += 1
                        tr.tool_names.append(part.tool_name)
                        args_str = part.args if isinstance(part.args, str) else json.dumps(part.args)
                        tr.steps.append(Step('tool_call', f'Tool call: {part.tool_name}({args_str})'))
                    elif part.part_kind == 'tool-return':
                        tr.tool_results.append(str(part.content))
                        tr.steps.append(Step('tool_result', f'Tool result: {part.content}'))
                    elif part.part_kind == 'text':
                        tr.final_answer = part.content
                        tr.steps.append(Step('llm_call', 'LLM response (final): generated text answer'))
                        tr.steps.append(Step('final_answer', f'Answer: {part.content}'))

            results.append(tr)
        except Exception as e:
            import traceback
            traceback.print_exc()
            elapsed = time.time() - start
            tr = TraceResult(
                framework='PydanticAI', prompt_label=PROMPT_LABELS[i], prompt=prompt,
                elapsed_s=round(elapsed, 2), error=str(e)[:300],
            )
            results.append(tr)
    return results


# ===================================================================
# OPENAI AGENTS SDK
# ===================================================================

def trace_openai_agents() -> list[TraceResult]:
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
        name='benchmark_agent', model=MODEL, instructions=SYSTEM_PROMPT,
        tools=[lookup_ticker, stock_price, company_hq, weather],
    )

    results = []
    for i, prompt in enumerate(PROMPTS):
        start = time.time()
        try:
            result = Runner.run_sync(agent, prompt, max_turns=MAX_ITERATIONS)
            elapsed = time.time() - start

            tr = TraceResult(
                framework='OpenAI Agents',
                prompt_label=PROMPT_LABELS[i],
                prompt=prompt,
                elapsed_s=round(elapsed, 2),
            )

            tr.steps.append(Step('input', f'System: {SYSTEM_PROMPT}'))
            tr.steps.append(Step('input', f'User: {prompt}'))

            for resp in result.raw_responses:
                has_tool_call = False
                for output_item in resp.output:
                    if output_item.type == 'function_call':
                        if not has_tool_call:
                            tr.steps.append(Step('llm_call', f'LLM response (iteration {tr.iterations}): decided to call tool(s)'))
                            tr.iterations += 1
                            has_tool_call = True
                        tr.tool_calls += 1
                        tr.tool_names.append(output_item.name)
                        tr.steps.append(Step('tool_call', f'Tool call: {output_item.name}({output_item.arguments})'))

                if not has_tool_call:
                    for output_item in resp.output:
                        if output_item.type == 'message':
                            for c in output_item.content:
                                if hasattr(c, 'text'):
                                    tr.final_answer = c.text
                                    tr.steps.append(Step('llm_call', 'LLM response (final): generated text answer'))
                                    tr.steps.append(Step('final_answer', f'Answer: {c.text}'))

            for item in result.new_items:
                if item.type == 'tool_call_output_item':
                    raw = item.raw_item
                    output_val = raw.get('output', '') if isinstance(raw, dict) else str(getattr(raw, 'output', ''))
                    tr.tool_results.append(output_val)

            # Re-interleave tool results into the steps for correct ordering
            result_idx = 0
            new_steps = []
            for s in tr.steps:
                new_steps.append(s)
                if s.step_type == 'tool_call' and result_idx < len(tr.tool_results):
                    new_steps.append(Step('tool_result', f'Tool result: {tr.tool_results[result_idx]}'))
                    result_idx += 1
            tr.steps = new_steps

            results.append(tr)
        except Exception as e:
            import traceback
            traceback.print_exc()
            elapsed = time.time() - start
            tr = TraceResult(
                framework='OpenAI Agents', prompt_label=PROMPT_LABELS[i], prompt=prompt,
                elapsed_s=round(elapsed, 2), error=str(e)[:300],
            )
            results.append(tr)
    return results


# ===================================================================
# MARKDOWN REPORT GENERATION
# ===================================================================

STEP_ICONS = {
    'input': '  INPUT',
    'llm_call': '    LLM',
    'tool_call': '   TOOL>',
    'tool_result': '  <TOOL',
    'final_answer': ' ANSWER',
}


def generate_markdown(all_results: dict[str, list[TraceResult]]) -> str:
    frameworks = list(all_results.keys())
    lines: list[str] = []
    w = lines.append

    w('# Agent Loop Benchmark: Full Trace Report')
    w('')
    w(f'**Model:** `{MODEL}`  ')
    w(f'**Max iterations:** {MAX_ITERATIONS}  ')
    w(f'**System prompt:** "{SYSTEM_PROMPT}"  ')
    w(f'**Frameworks:** {", ".join(frameworks)}')
    w('')
    w('## Tool Definitions (shared across all frameworks)')
    w('')
    w('| Tool | Signature | Description |')
    w('|------|-----------|-------------|')
    w('| `lookup_ticker` | `(company_name: str) -> str` | Maps company name to ticker symbol |')
    w('| `stock_price` | `(ticker: str) -> float` | Returns mock stock price for ticker |')
    w('| `company_hq` | `(ticker: str) -> str` | Returns HQ city for ticker |')
    w('| `weather` | `(city: str) -> str` | Returns mock weather for city |')
    w('')
    w('### Mock Data')
    w('')
    w('```')
    w(f'Companies: {json.dumps(COMPANY_DB, indent=2)}')
    w(f'Stock prices: {json.dumps(STOCK_DB)}')
    w(f'Weather: {json.dumps(WEATHER_DB)}')
    w('```')
    w('')

    for i, prompt in enumerate(PROMPTS):
        w(f'---')
        w(f'## Scenario {i+1}: {PROMPT_LABELS[i]}')
        w('')
        w(f'**Prompt:**')
        w(f'> {prompt}')
        w('')

        # Quick comparison table
        w('### Summary')
        w('')
        w(f'| Metric | {" | ".join(frameworks)} |')
        w(f'|--------|{"|".join(["-----" for _ in frameworks])}|')

        row_iters = '| Iterations |'
        row_calls = '| Tool calls |'
        row_time = '| Time (s) |'
        row_seq = '| Tool sequence |'
        for fw in frameworks:
            r = all_results[fw][i]
            row_iters += f' {r.iterations} |'
            row_calls += f' {r.tool_calls} |'
            row_time += f' {r.elapsed_s} |'
            seq = ' -> '.join(r.tool_names) if r.tool_names else '(none)'
            row_seq += f' `{seq}` |'
        w(row_iters)
        w(row_calls)
        w(row_time)
        w(row_seq)

        # Verify agreement
        seqs = [tuple(all_results[fw][i].tool_names) for fw in frameworks if not all_results[fw][i].error]
        results_match = [all_results[fw][i].tool_results for fw in frameworks if not all_results[fw][i].error]
        w('')
        if len(set(seqs)) == 1:
            w('**Tool call sequences: ALL MATCH**')
        else:
            w(f'**Tool call sequences: MISMATCH** {[list(s) for s in seqs]}')

        if len(set(tuple(r) for r in results_match)) == 1:
            w(f'**Tool results: ALL MATCH** `{results_match[0]}`')
        else:
            w(f'**Tool results: MISMATCH**')
            for fw in frameworks:
                r = all_results[fw][i]
                w(f'  - {fw}: `{r.tool_results}`')
        w('')

        # Step-by-step traces for each framework
        w('### Step-by-Step Execution Traces')
        w('')

        for fw in frameworks:
            r = all_results[fw][i]
            w(f'#### {fw} ({r.elapsed_s}s)')
            w('')
            if r.error:
                w(f'**ERROR:** {r.error}')
                w('')
                continue

            w('```')
            step_num = 0
            for s in r.steps:
                label = STEP_ICONS.get(s.step_type, '     ???')
                detail = s.detail
                if len(detail) > 200:
                    detail = detail[:200] + '...'
                w(f'  {label}  {detail}')
                step_num += 1
            w('```')
            w('')

        # Final answer comparison
        w('### Final Answers')
        w('')
        for fw in frameworks:
            r = all_results[fw][i]
            answer = r.final_answer.replace('\n', ' ')[:200] if r.final_answer else '(none)'
            w(f'- **{fw}:** {answer}')
        w('')

    # Aggregate summary
    w('---')
    w('## Aggregate Summary')
    w('')
    w(f'| Metric | {" | ".join(frameworks)} |')
    w(f'|--------|{"|".join(["-----" for _ in frameworks])}|')

    row = '| Total iterations |'
    for fw in frameworks:
        total = sum(r.iterations for r in all_results[fw] if not r.error)
        row += f' {total} |'
    w(row)

    row = '| Total tool calls |'
    for fw in frameworks:
        total = sum(r.tool_calls for r in all_results[fw] if not r.error)
        row += f' {total} |'
    w(row)

    row = '| Total time (s) |'
    for fw in frameworks:
        total = round(sum(r.elapsed_s for r in all_results[fw]), 2)
        row += f' {total} |'
    w(row)

    row = '| Avg time/prompt (s) |'
    for fw in frameworks:
        total = round(sum(r.elapsed_s for r in all_results[fw]) / len(PROMPTS), 2)
        row += f' {total} |'
    w(row)

    row = '| Errors |'
    for fw in frameworks:
        errs = sum(1 for r in all_results[fw] if r.error)
        row += f' {errs} |'
    w(row)
    w('')

    w('## Correctness Verification')
    w('')
    all_ok = True
    for i, prompt in enumerate(PROMPTS):
        seqs = [tuple(all_results[fw][i].tool_names) for fw in frameworks if not all_results[fw][i].error]
        results_vals = [tuple(all_results[fw][i].tool_results) for fw in frameworks if not all_results[fw][i].error]
        seq_ok = len(set(seqs)) <= 1
        res_ok = len(set(results_vals)) <= 1
        status = 'PASS' if (seq_ok and res_ok) else 'FAIL'
        if status == 'FAIL':
            all_ok = False
        w(f'- **Scenario {i+1} ({PROMPT_LABELS[i]}):** {status}')
        if not seq_ok:
            w(f'  - Tool sequences differ: {[list(s) for s in set(seqs)]}')
        if not res_ok:
            w(f'  - Tool results differ: {[list(r) for r in set(results_vals)]}')
    w('')
    w(f'**Overall: {"ALL PASS" if all_ok else "FAILURES DETECTED"}**')
    w('')

    return '\n'.join(lines)


if __name__ == '__main__':
    all_results: dict[str, list[TraceResult]] = {}

    for name, runner in [
        ('LangGraph', trace_langgraph),
        ('PydanticAI', trace_pydantic_ai),
        ('OpenAI Agents', trace_openai_agents),
        ('Pixeltable', trace_pixeltable),
    ]:
        print(f'Running {name}...', flush=True)
        all_results[name] = runner()
        print(f'  Done ({sum(r.elapsed_s for r in all_results[name]):.2f}s total)')

    report = generate_markdown(all_results)

    output_path = os.path.join(os.path.dirname(__file__), 'agent_loop_benchmark_report.md')
    with open(output_path, 'w') as f:
        f.write(report)

    print(f'\nReport written to: {output_path}')
    print(report)
