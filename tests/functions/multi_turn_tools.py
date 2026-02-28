"""Multi-turn tool UDFs for agent loop benchmarks."""

import pixeltable as pxt

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


@pxt.udf
def lookup_ticker(company_name: str) -> str:
    """Look up the stock ticker symbol for a company by its name. Returns the ticker string.

    Args:
        company_name - The name of the company to look up.
    """
    key = company_name.upper()
    if key in COMPANY_DB:
        return COMPANY_DB[key]['ticker']
    return f'Unknown company: {company_name}'


@pxt.udf
def stock_price(ticker: str) -> float:
    """Get the current stock price for a ticker symbol. Returns the price as a float.

    Args:
        ticker - The ticker symbol to look up.
    """
    return STOCK_DB.get(ticker.upper(), 0.0)


@pxt.udf
def company_hq(ticker: str) -> str:
    """Get the headquarters city for a company given its ticker symbol. Returns the city name.

    Args:
        ticker - The ticker symbol of the company.
    """
    for info in COMPANY_DB.values():
        if info['ticker'] == ticker.upper():
            return info['hq']
    return f'Unknown ticker: {ticker}'


@pxt.udf
def weather(city: str) -> str:
    """Get the current weather forecast for a city. Returns a weather description string.

    Args:
        city - The name of the city.
    """
    return WEATHER_DB.get(city, f'No data for {city}')
