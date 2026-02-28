"""
Head-to-head comparison: Pixeltable agent loop vs LangGraph ReAct agent.
Same tools, same prompts, same model, same max iterations.
"""

import json
import os
import time

os.environ.setdefault('OPENAI_API_KEY', os.environ.get('OPENAI_API_KEY', ''))

MODEL = 'gpt-4o-mini'
MAX_ITERATIONS = 10

PROMPTS = [
    'What is the stock price of NVDA today?',
    'What is the weather in San Francisco?',
    'What is the stock price of NVDA and the weather in San Francisco?',
    'What is 2 + 2?',
    'What is the stock price of NVDA today? Also, what is the stock price of UAL?',
]

# ---------------------------------------------------------------------------
# Shared tool logic (pure Python)
# ---------------------------------------------------------------------------

def _stock_price(ticker: str) -> float:
    if ticker == 'NVDA':
        return 131.17
    elif ticker == 'UAL':
        return 82.88
    return 0.0

def _weather(city: str) -> str:
    if city == 'San Francisco':
        return 'Cloudy with a chance of meatballs'
    return 'Unknown city'


# ===================================================================
# PIXELTABLE
# ===================================================================

def run_pixeltable():
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tests'))

    import pixeltable as pxt
    from pixeltable.functions.openai import chat_completions
    from functions.tool_utils import stock_price, weather

    pxt.drop_dir('compare', force=True, if_not_exists='ignore')
    pxt.create_dir('compare', if_exists='ignore')
    t = pxt.create_table('compare.pxt_test', {'prompt': pxt.String}, if_exists='replace')

    tools = pxt.tools(stock_price, weather)
    messages = [
        {'role': 'system', 'content': 'You are a helpful assistant. Use tools when needed.'},
        {'role': 'user', 'content': t.prompt},
    ]
    t.add_computed_column(
        response=chat_completions(messages, model=MODEL, tools=tools, max_tool_iterations=MAX_ITERATIONS)
    )

    results = []
    for prompt in PROMPTS:
        start = time.time()
        t.insert(prompt=prompt)
        elapsed = time.time() - start

        row = t.where(t.prompt == prompt).select(t.response).collect()
        resp = row['response'][0]

        history = resp.get('tool_calls_history', [])
        iterations = resp.get('iterations', 0)
        final_text = resp['choices'][0]['message'].get('content', '')

        tool_names = [h['tool_name'] for h in history]
        tool_results = [h['result'] for h in history]

        results.append({
            'prompt': prompt,
            'iterations': iterations,
            'tool_calls': len(history),
            'tool_names': tool_names,
            'tool_results': tool_results,
            'final_answer': final_text[:200] if final_text else '(none)',
            'elapsed_s': round(elapsed, 2),
        })

    return results


# ===================================================================
# LANGGRAPH
# ===================================================================

def run_langgraph():
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_core.tools import tool as lc_tool
    from langchain_openai import ChatOpenAI
    from langgraph.prebuilt import create_react_agent  # noqa: deprecation warning expected

    @lc_tool
    def stock_price(ticker: str) -> float:
        """Get today's stock price for a given ticker symbol.

        Args:
            ticker: The ticker symbol of the stock to look up.
        """
        return _stock_price(ticker)

    @lc_tool
    def weather(city: str) -> str:
        """Get today's weather forecast for a given city.

        Args:
            city: The name of the city to look up.
        """
        return _weather(city)

    llm = ChatOpenAI(model=MODEL)
    agent = create_react_agent(llm, [stock_price, weather])

    results = []
    for prompt in PROMPTS:
        start = time.time()

        input_messages = [
            SystemMessage(content='You are a helpful assistant. Use tools when needed.'),
            HumanMessage(content=prompt),
        ]

        response = agent.invoke(
            {'messages': input_messages},
            config={'recursion_limit': MAX_ITERATIONS + 5},
        )

        elapsed = time.time() - start

        all_msgs = response['messages']

        tool_calls_made = []
        tool_results_received = []
        for msg in all_msgs:
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_calls_made.append(tc['name'])
            if msg.type == 'tool':
                tool_results_received.append(msg.content)

        iterations = 0
        for msg in all_msgs:
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                iterations += 1

        final_text = all_msgs[-1].content if all_msgs else ''

        results.append({
            'prompt': prompt,
            'iterations': iterations,
            'tool_calls': len(tool_calls_made),
            'tool_names': tool_calls_made,
            'tool_results': tool_results_received,
            'final_answer': final_text[:200] if final_text else '(none)',
            'elapsed_s': round(elapsed, 2),
        })

    return results


# ===================================================================
# COMPARISON
# ===================================================================

def print_comparison(pxt_results, lg_results):
    print('\n' + '=' * 100)
    print('PIXELTABLE vs LANGGRAPH AGENT LOOP COMPARISON')
    print(f'Model: {MODEL} | Max iterations: {MAX_ITERATIONS}')
    print('=' * 100)

    for i, prompt in enumerate(PROMPTS):
        pxt = pxt_results[i]
        lg = lg_results[i]

        print(f'\n{"─" * 100}')
        print(f'PROMPT: "{prompt}"')
        print(f'{"─" * 100}')

        print(f'  {"":30s} {"PIXELTABLE":>30s}    {"LANGGRAPH":>30s}')
        print(f'  {"Iterations":30s} {pxt["iterations"]:>30d}    {lg["iterations"]:>30d}')
        print(f'  {"Tool calls":30s} {pxt["tool_calls"]:>30d}    {lg["tool_calls"]:>30d}')
        print(f'  {"Tools used":30s} {str(pxt["tool_names"]):>30s}    {str(lg["tool_names"]):>30s}')
        print(f'  {"Time (s)":30s} {pxt["elapsed_s"]:>30.2f}    {lg["elapsed_s"]:>30.2f}')
        print()
        print(f'  PXT answer: {pxt["final_answer"][:120]}')
        print(f'  LG  answer: {lg["final_answer"][:120]}')

        if pxt['tool_results']:
            print(f'  PXT tool results: {pxt["tool_results"]}')
        if lg['tool_results']:
            print(f'  LG  tool results: {lg["tool_results"]}')

    print(f'\n{"=" * 100}')
    print('SUMMARY')
    print(f'{"=" * 100}')
    pxt_total_iters = sum(r['iterations'] for r in pxt_results)
    lg_total_iters = sum(r['iterations'] for r in lg_results)
    pxt_total_calls = sum(r['tool_calls'] for r in pxt_results)
    lg_total_calls = sum(r['tool_calls'] for r in lg_results)
    pxt_total_time = sum(r['elapsed_s'] for r in pxt_results)
    lg_total_time = sum(r['elapsed_s'] for r in lg_results)

    print(f'  Total iterations:  PXT={pxt_total_iters}  LG={lg_total_iters}')
    print(f'  Total tool calls:  PXT={pxt_total_calls}  LG={lg_total_calls}')
    print(f'  Total time (s):    PXT={pxt_total_time:.2f}  LG={lg_total_time:.2f}')
    print()

    for i, prompt in enumerate(PROMPTS):
        pxt = pxt_results[i]
        lg = lg_results[i]
        match = 'MATCH' if pxt['tool_names'] == lg['tool_names'] else 'DIFFER'
        print(f'  [{match}] Prompt {i+1}: PXT {pxt["tool_names"]} vs LG {lg["tool_names"]}')


if __name__ == '__main__':
    print('Running LangGraph agent...')
    lg_results = run_langgraph()

    print('\nRunning Pixeltable agent loop...')
    pxt_results = run_pixeltable()

    print_comparison(pxt_results, lg_results)
