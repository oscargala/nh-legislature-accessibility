const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const NH_URL = 'https://gc.nh.gov/house/committees/remotetestimony/default.aspx';

// Create an axios instance with a cookie jar
const axiosInstance = axios.create({
    maxRedirects: 5,
    withCredentials: true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
    }
});

// Store the last response cookies
let lastResponseCookies = null;

async function getFreshFormData() {
    console.log('Getting fresh form data...');
    const response = await axiosInstance.get(NH_URL);
    
    // Store cookies from the response
    if (response.headers['set-cookie']) {
        lastResponseCookies = response.headers['set-cookie'];
        console.log('Stored cookies from initial request');
    }
    
    const $ = cheerio.load(response.data);
    
    // Get all form fields
    const formFields = {};
    $('input[type="hidden"]').each((i, elem) => {
        formFields[$(elem).attr('name')] = $(elem).val();
    });
    
    // Get all select fields
    $('select').each((i, elem) => {
        formFields[$(elem).attr('name')] = $(elem).val() || '';
    });
    
    // Get all text fields
    $('input[type="text"]').each((i, elem) => {
        formFields[$(elem).attr('name')] = $(elem).val() || '';
    });

    const formData = {
        __VIEWSTATE: $('#__VIEWSTATE').val(),
        __EVENTVALIDATION: $('#__EVENTVALIDATION').val(),
        __VIEWSTATEGENERATOR: $('#__VIEWSTATEGENERATOR').val(),
        ...formFields
    };

    // Extract calendar links
    const calendarLinks = {};
    $('a[href*="__doPostBack"]').each((i, elem) => {
        const href = $(elem).attr('href');
        const title = $(elem).attr('title');
        if (href && title) {
            const match = href.match(/'ctl00\$pageBody\$calHearingDate','(\d+)'/);
            if (match) {
                calendarLinks[match[1]] = {
                    href,
                    title,
                    postbackData: {
                        __EVENTTARGET: 'ctl00$pageBody$calHearingDate',
                        __EVENTARGUMENT: match[1]
                    }
                };
            }
        }
    });

    return { formData, calendarLinks };
}

app.get('/api/initial-form-data', async (req, res) => {
    try {
        const { formData, calendarLinks } = await getFreshFormData();
        res.json({ formData, calendarLinks });
    } catch (error) {
        console.error('Error fetching initial form data:', error);
        res.status(500).json({ error: 'Failed to fetch initial form data' });
    }
});

async function makeAspNetRequest(eventTarget, eventArgument, formData, additionalFields = {}) {
    // Include all form fields from the original form
    const postData = new URLSearchParams({
        ...formData, // Include all original form fields
        'ctl00$pageBody$ScriptManager1': `ctl00$pageBody$UpdatePanel1|${eventTarget}`,
        '__EVENTTARGET': eventTarget,
        '__EVENTARGUMENT': eventArgument,
        '__LASTFOCUS': '',
        '__ASYNCPOST': 'true',
        ...additionalFields
    });

    // Include the last known cookies in the request
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-MicrosoftAjax': 'Delta=true',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    if (lastResponseCookies) {
        headers.Cookie = lastResponseCookies.map(cookie => cookie.split(';')[0]).join('; ');
    }

    const response = await axiosInstance.post(NH_URL, postData, { headers });

    // Store new cookies if any
    if (response.headers['set-cookie']) {
        lastResponseCookies = response.headers['set-cookie'];
        console.log('Updated cookies from response');
    }

    // Parse ASP.NET AJAX response — pipe-delimited format with hiddenField and updatePanel segments
    const responseText = response.data;
    const parts = responseText.split('|');

    let htmlContent = '';
    let formValues = {};

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part === 'hiddenField') {
            const fieldName = parts[i + 1];
            const fieldValue = parts[i + 2];
            formValues[fieldName] = fieldValue;
            i += 2; // Skip the next two parts since we've processed them
        } else if (part === 'updatePanel') {
            const panelId = parts[i + 1];
            if (panelId === 'pageBody_UpdatePanel1') {
                htmlContent = parts[i + 2];
                i += 2;
            }
        }
    }

    return { htmlContent, formValues };
}

app.post('/api/fetch-date-data', async (req, res) => {
    try {
        const { dateArg } = req.body;
        console.log(`Fetching data for date arg: ${dateArg}`);
        
        // Get fresh form data for this request
        const { formData } = await getFreshFormData();
        
        const { htmlContent, formValues } = await makeAspNetRequest(
            'ctl00$pageBody$calHearingDate',
            dateArg.toString(),
            formData
        );

        // Parse the HTML to extract committees
        const $ = cheerio.load(htmlContent || '');
        const committees = {};
            
        // Extract committees from the response
        $('#pageBody_ddlCommittee option').each((i, elem) => {
            const value = $(elem).val();
            const text = $(elem).text().trim();
            if (value && text !== 'Select a Committee -->') {
                committees[value] = text;
            }
        });

        // Return both request and response data
        res.json({
            formData: {
                __VIEWSTATE: formValues.__VIEWSTATE || formData.__VIEWSTATE,
                __VIEWSTATEGENERATOR: formValues.__VIEWSTATEGENERATOR || formData.__VIEWSTATEGENERATOR,
                __EVENTVALIDATION: formValues.__EVENTVALIDATION || formData.__EVENTVALIDATION
            },
            committees: committees
        });
        
    } catch (error) {
        console.error('Error fetching date data:', error);
        res.status(500).json({ error: 'Failed to fetch date data: ' + error.message });
    }
});

app.post('/api/fetch-committee-bills', async (req, res) => {
    try {
        const { committeeId, formData } = req.body;
        const { htmlContent, formValues } = await makeAspNetRequest(
            'ctl00$pageBody$ddlCommittee',
            '',
            {
                __VIEWSTATE: formData.viewstate || formData.__VIEWSTATE,
                __VIEWSTATEGENERATOR: formData.viewstategenerator || formData.__VIEWSTATEGENERATOR,
                __EVENTVALIDATION: formData.eventvalidation || formData.__EVENTVALIDATION
            },
            { 
                'ctl00$pageBody$ddlCommittee': committeeId,
                'ctl00$pageBody$txtFirstName': '',
                'ctl00$pageBody$txtLastName': '',
                'ctl00$pageBody$txtTown': '',
                'ctl00$pageBody$ddl_state': 'NH',
                'ctl00$pageBody$txtEmail': '',
                'ctl00$pageBody$ddlBills': '',
                'ctl00$pageBody$ddlWho': 'Select an Option Below -->',
                'ctl00$pageBody$txtRepresenting': 'Myself',
                'ctl00$pageBody$txtEditor': ''
            }
        );

        // Parse the HTML to extract bills
        const $ = cheerio.load(htmlContent || '');
        const bills = {};
        const billsData = [];
            
        // Extract bills and their details from the response
        $('#pageBody_ddlBills option').each((i, elem) => {
            const value = $(elem).val();
            const text = $(elem).text().trim();
            if (value && text !== 'Select a Bill -->') {
                // Parse the bill text to extract information
                // Example format: "10:00 AM - HB1234 Description of the bill"
                const billMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*((?:HB|SB)\d+)\s*(.*)/i);
                
                if (billMatch) {
                    const [_, time, billNumber, description] = billMatch;
                    billsData.push({
                        date: new Date().toISOString().split('T')[0], // Current date as placeholder
                        committee: $('#pageBody_ddlCommittee option:selected').text().trim(),
                        time: time,
                        bill: billNumber,
                        description: description.trim(),
                        legiscanLink: `https://legiscan.com/NH/bill/${billNumber}/${new Date().getFullYear()}`
                    });
                }
                
                bills[value] = text;
            }
        });

        // Return both request and response data
        res.json({
            bills: bills,
            billsData: billsData,
            formData: {
                __VIEWSTATE: formValues.__VIEWSTATE || '',
                __VIEWSTATEGENERATOR: formValues.__VIEWSTATEGENERATOR || '',
                __EVENTVALIDATION: formValues.__EVENTVALIDATION || ''
            }
        });
        
    } catch (error) {
        console.error('Error fetching committee bills:', error);
        res.status(500).json({ error: 'Failed to fetch committee bills: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
