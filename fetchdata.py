import requests
from bs4 import BeautifulSoup

# URL of the testimony page
url = "https://gc.nh.gov/house/committees/remotetestimony/default.aspx"

# Headers to mimic a real browser request
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded"
}

# Step 1: Perform an initial GET request to fetch VIEWSTATE and EVENTVALIDATION
session = requests.Session()  # Use a session to maintain cookies
response = session.get(url, headers=headers)
soup = BeautifulSoup(response.text, "html.parser")

# Extract the dynamic values
viewstate = soup.find("input", {"name": "__VIEWSTATE"})["value"]
eventvalidation = soup.find("input", {"name": "__EVENTVALIDATION"})["value"]
viewstategenerator = soup.find("input", {"name": "__VIEWSTATEGENERATOR"})["value"]

# Example hearing date argument (modify as needed)
hearing_date_argument = "9172"  # Example date for February 10

# Step 2: Submit a POST request with valid VIEWSTATE & EVENTVALIDATION
form_data = {
    "__EVENTTARGET": "ctl00$pageBody$calHearingDate",
    "__EVENTARGUMENT": hearing_date_argument,
    "__LASTFOCUS": "",
    "__VIEWSTATE": viewstate,
    "__VIEWSTATEGENERATOR": viewstategenerator,
    "__EVENTVALIDATION": eventvalidation,
    "ctl00$pageBody$ddlCommittee": "",  # Keep empty, will update after POST
}

# Submit the POST request
post_response = session.post(url, headers=headers, data=form_data)
post_soup = BeautifulSoup(post_response.text, "html.parser")

# Step 3: Extract updated committee options
committee_select = post_soup.find("select", {"name": "ctl00$pageBody$ddlCommittee"})
if committee_select:
    committees = {option["value"]: option.text.strip() for option in committee_select.find_all("option") if option["value"]}
    print("\n✅ Available Committees:")
    for key, value in committees.items():
        print(f"{key}: {value}")
else:
    print("\n❌ No committees found.")

# Step 4: Extract available bills
bills_select = post_soup.find("select", {"name": "ctl00$pageBody$ddlBills"})
if bills_select:
    bills = {option["value"]: option.text.strip() for option in bills_select.find_all("option") if option["value"] != "Select a Bill -->"}
    print("\n📜 Available Bills:")
    for key, value in bills.items():
        print(f"{key}: {value}")
else:
    print("\n❌ No bills found.")