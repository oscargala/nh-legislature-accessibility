# nh-legislature-accessibility

**Status: Abandoned** — See note below.

Built in February 2025 as a civic tech experiment to lower barriers to NH legislative participation.

## The Problem

Submitting remote testimony to the New Hampshire legislature is unnecessarily difficult. The state's [remote testimony portal](https://gc.nh.gov/house/committees/remotetestimony/default.aspx) is an ASP.NET WebForms application that requires navigating a multi-step form — selecting a hearing date, then a committee, then a bill — with each step triggering a postback that reloads the page. There's no direct linking, no API, and no way to see what's coming up without clicking through the calendar manually.

This creates a real barrier to civic participation. If you want to weigh in on a bill, you first have to figure out *when* it's being heard, navigate an opaque interface to find it, and then fill out the form — all without any of the context (like bill text or summaries) that would help you participate meaningfully.

## What This Project Was Building

This project was an attempt to scrape the NH remote testimony site and present the hearing schedule in a more accessible way. The approach:

1. **A Node.js proxy server** that handles the ASP.NET ViewState/postback dance — fetching fresh form tokens, submitting date and committee selections, and parsing the pipe-delimited AJAX responses
2. **A browser frontend** that lets you pick a date, see available committees, and browse bills with links to [LegiScan](https://legiscan.com/) for full bill text
3. **A Python script** (`fetchdata.py`) that does the same scraping flow as a standalone CLI tool, useful for experimentation

The core technical challenge was reverse-engineering ASP.NET UpdatePanel requests, which require threading `__VIEWSTATE`, `__EVENTVALIDATION`, and `__VIEWSTATEGENERATOR` tokens through each request, plus specific headers (`X-MicrosoftAjax: Delta=true`) and a custom pipe-delimited response format.

## Stack

- **Node.js** with Express, axios, and cheerio (0.22.0) for server-side scraping
- **Vanilla JS** frontend — no framework, just two classes (`NHBillsFetcher` for API calls, `BillsUI` for DOM rendering)
- **Python** with requests and BeautifulSoup for the standalone scraper

## Why Development Was Abandoned

[NH Remote Testimony](https://nhremotetestimony.org) shipped a working solution to the same problem — and did it better than this project was heading. They deserve credit for making civic participation in New Hampshire meaningfully easier. There's no reason to duplicate that effort.

## Running Locally

If you want to explore the code:

```bash
# Install dependencies
npm install

# Start the server (runs on port 3000 by default, or set PORT env var)
npm start

# Open http://localhost:3000 in your browser
```

For the Python scraper:

```bash
python3 -m venv nh_testimony_env
source nh_testimony_env/bin/activate
pip install requests beautifulsoup4
python fetchdata.py
```

Note: The scraper depends on the NH state site's current HTML structure. If they've changed their markup since this was last touched, things will break.
