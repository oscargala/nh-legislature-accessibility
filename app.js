class NHBillsFetcher {
    constructor() {
        this.baseUrl = 'http://localhost:3000/api';
    }

    async getInitialFormData() {
        const response = await fetch(`${this.baseUrl}/initial-form-data`);
        if (!response.ok) {
            throw new Error('Failed to fetch initial form data');
        }
        return await response.json();
    }

    async fetchDataForDate(dateArg) {
        const response = await fetch(`${this.baseUrl}/fetch-date-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dateArg })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch date data');
        }
        return await response.json();
    }

    async fetchBillsForCommittee(committeeId, formData) {
        const response = await fetch(`${this.baseUrl}/fetch-committee-bills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ committeeId, formData })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch committee bills');
        }
        return await response.json();
    }
}

class BillsUI {
    constructor() {
        this.fetcher = new NHBillsFetcher();
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error');
        this.billsList = document.getElementById('billsList').querySelector('tbody');
        this.dateInput = document.getElementById('dateArg');
        this.fetchButton = document.getElementById('fetchCommittees');
        this.fetchBillsButton = document.getElementById('fetchBills');
        
        // Debug elements
        this.requestUrl = document.getElementById('requestUrl');
        this.requestData = document.getElementById('requestData');
        this.responseData = document.getElementById('responseData');
        
        // Committee select element
        this.committeeSelect = document.getElementById('committeeSelect');
        
        this.fetchButton.addEventListener('click', () => this.fetchCommittees());
        this.fetchBillsButton.addEventListener('click', () => this.fetchBills());
        this.showLoading(false);

        // Store form data for reuse
        this.lastFormData = null;
    }

    showLoading(show) {
        this.loadingElement.style.display = show ? 'block' : 'none';
    }

    showError(message) {
        this.errorElement.textContent = message;
        this.errorElement.style.display = message ? 'block' : 'none';
    }

    updateDebugInfo(url, formData, response) {
        this.requestUrl.textContent = url;
        this.requestData.textContent = JSON.stringify(formData, null, 2);
        this.responseData.textContent = JSON.stringify(response, null, 2);
    }

    populateCommitteeSelect(committees) {
        // Clear existing options except the first one
        while (this.committeeSelect.options.length > 1) {
            this.committeeSelect.remove(1);
        }

        // Add new committee options
        Object.entries(committees).forEach(([id, name]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            this.committeeSelect.appendChild(option);
        });
    }

    async fetchCommittees() {
        try {
            this.showError('');
            this.showLoading(true);
            this.clearBillsList();

            const dateArg = this.dateInput.value;
            const formData = await this.fetcher.getInitialFormData();
            this.lastFormData = formData; // Store for reuse
            
            // Display request details
            const url = 'https://gc.nh.gov/house/committees/remotetestimony/default.aspx';
            const postData = {
                'ctl00$pageBody$ScriptManager1': 'ctl00$pageBody$UpdatePanel1|ctl00$pageBody$calHearingDate',
                'ctl00$pageBody$txtFirstName': '',
                'ctl00$pageBody$txtLastName': '',
                'ctl00$pageBody$txtTown': '',
                'ctl00$pageBody$ddl_state': 'NH',
                'ctl00$pageBody$txtEmail': '',
                'ctl00$pageBody$ddlCommittee': '',
                'ctl00$pageBody$ddlBills': '',
                'ctl00$pageBody$ddlWho': 'Select an Option Below -->',
                'ctl00$pageBody$txtRepresenting': 'Myself',
                'ctl00$pageBody$txtEditor': '',
                '__EVENTTARGET': 'ctl00$pageBody$calHearingDate',
                '__EVENTARGUMENT': dateArg.toString(),
                '__LASTFOCUS': '',
                '__VIEWSTATE': formData.viewstate,
                '__VIEWSTATEGENERATOR': formData.viewstategenerator,
                '__EVENTVALIDATION': formData.eventvalidation,
                '__ASYNCPOST': 'true'
            };

            const data = await this.fetcher.fetchDataForDate(dateArg);
            this.updateDebugInfo(url, postData, data);
            
            // Store form values from response
            if (data.formData) {
                document.getElementById('__VIEWSTATE').value = data.formData.__VIEWSTATE || '';
                document.getElementById('__VIEWSTATEGENERATOR').value = data.formData.__VIEWSTATEGENERATOR || '';
                document.getElementById('__EVENTVALIDATION').value = data.formData.__EVENTVALIDATION || '';
            }
            
            // Populate committee select if committees are available
            if (data.committees) {
                this.populateCommitteeSelect(data.committees);
            }
            
        } catch (error) {
            this.showError('Error fetching data: ' + error.message);
            console.error('Error:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async fetchBills() {
        try {
            const committeeId = this.committeeSelect.value;
            if (!committeeId) {
                this.showError('Please select a committee first');
                return;
            }

            this.showError('');
            this.showLoading(true);
            this.clearBillsList();

            const url = 'https://gc.nh.gov/house/committees/remotetestimony/default.aspx';
            
            // Get the form data from the previous response
            const formData = {
                viewstate: document.getElementById('__VIEWSTATE')?.value,
                viewstategenerator: document.getElementById('__VIEWSTATEGENERATOR')?.value,
                eventvalidation: document.getElementById('__EVENTVALIDATION')?.value
            };

            // Send both committee ID and form data
            const data = await this.fetcher.fetchBillsForCommittee(committeeId, formData);
            this.updateDebugInfo(url, { committeeId, formData }, data);

            // Populate the bills table
            if (data.billsData && data.billsData.length > 0) {
                data.billsData.forEach(bill => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${bill.date}</td>
                        <td>${bill.committee}</td>
                        <td>${bill.time}</td>
                        <td>${bill.bill} - ${bill.description}</td>
                        <td><a href="${bill.legiscanLink}" target="_blank">View on Legiscan</a></td>
                    `;
                    this.billsList.appendChild(row);
                });
            } else {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="5">No bills found for this committee.</td>';
                this.billsList.appendChild(row);
            }

        } catch (error) {
            this.showError('Error fetching bills: ' + error.message);
            console.error('Error:', error);
        } finally {
            this.showLoading(false);
        }
    }

    clearBillsList() {
        this.billsList.innerHTML = '';
    }
}

// Initialize the application
const app = new BillsUI(); 