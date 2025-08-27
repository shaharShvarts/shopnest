const request = require('request');
const http = require('http');

// General constants
const API_KEY = 'f1c85d16fc1acd369a93f0489f4615d93371632d97a9b0a197de6d4dc0da51bf';
const DEVELOPER_EMAIL = 'demo@demo.com';
const ENV_DEMO = 'https://demo.ezcount.co.il/';
// const ENV_PROD = 'https://api.ezcount.co.il/';
const ENV_URL = ENV_DEMO;
const BASEURL = 'http://localhost:3000/';

if (DEVELOPER_EMAIL == 'demo@demo.com') {
	console.error("Please change the developer email to your email")
}


/* ----OPEN THE CLEARING PAGE---- */

let reqUrl = ENV_URL + 'api/payment/prepareSafeUrl/clearingFormForWeb';

let clearinFormData = {
	api_key: API_KEY,
	developer_email: DEVELOPER_EMAIL,
	sum: 15,
	payments: "3-3",
	currency: 'ILS',
	successUrl: BASEURL + 'successAndInvoice'
};

let secretTransactionId = null;


/* ----CREATE INVOICES AFTER RETURN FROM CLEARING PAGE---- */

//after completing the clearing process in the clearing page return to this page (the successUrl):
http.createServer(function (serverReq, serverRes) {
	serverRes.writeHead(200, {'Content-Type': 'text/html'}); // http header
	// an helper function
	function _flushResponseEnd(txt) {
		serverRes.write(txt); //write a response
		serverRes.end();
	}

	// get the url
	let url = serverReq.url;

	/**
	 * OPEN THE CLEARING FORM
	 */
	if (url.startsWith("/openClearingForm") || url == '/') {
		//send a request to get permission to the clearing page.
		request.post(reqUrl, {json: clearinFormData}, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				// print to console the data received from this request. [ksys_token , url , secretTransactionId]
				console.log(body)
				// store the token for later validation
				secretTransactionId = body.secretTransactionId;
				console.warn("secretTransactionId should be stored into session!")

				//redirect the user to the clearing form
				serverRes.writeHead(302, {
					'Location': body.url
				});
				serverRes.end();
			} else {
				console.error(error, response);
				_flushResponseEnd("Error opening clearing form, please check your console");
			}
		});
	}


	/**
	 * PARSE THE CLEARING RESPONSE
	 */
	else if (url.startsWith('/successAndInvoice')) {
		// ensure there is a secretTransactionId, then continue creating the invoices

		//set the vars for validate request
		let validateUrl = ENV_URL + "/api/payment/validate/" + secretTransactionId;
		let validateData = {
			api_key: API_KEY,
			developer_email: DEVELOPER_EMAIL,
		};

		let validateRequest = {};
		let createDoc = {};
		request.post(validateUrl, {json: validateData}, function (error, response, validateResponse) {
			if (validateResponse.success) {
				// if there is permission , create the invoices
				createDocFunction(validateResponse).then(function (createDocResponse) {
					_flushResponseEnd(JSON.stringify(createDocResponse));
				})
			} else {
				_flushResponseEnd('some problem in the validate request');
			}
		});
	}
	else {
		_flushResponseEnd('<h1>Wrong Page!<h1>'); //write a response
	}
}).listen(3000, function () {
	console.log("server start at port 3000\n please navigate your browser to http://localhost:3000 "); //the server object listens on port 3000
});

function createDocFunction(validateResponse) {
	let createDocData = {
		// CUSTOMER credentials
		api_key: API_KEY,
		developer_email: DEVELOPER_EMAIL,
		type: 320 /*invoice receipt*/,
		description: '[DOCUMENT DESCRIPTION]',
		customer_name: '[CUSTOMER NAME HERE]',
		customer_email: '[CUSTOMER EMAIL HERE]',
		customer_address: '[CUSTOMER ADDRESS HERE]',
		item: [{
			catalog_number: 'MKT1',
			details: 'item 1 details',
			amount: 1,
			price: validateResponse.cgp_payment_total,
			vat_type: 'INC' //this price include the VAT
		}],
		payment: [{
			payment_type: 3 /*type CC*/,
			payment: validateResponse.cgp_payment_total, //the sum field
			cc_number: validateResponse.cgp_customer_cc_4_digits, //last 4 digits!!!
			cc_type_name: validateResponse.cgp_customer_cc_name,
			cc_deal_type: 1 /*no payments*/,
		}],
		price_total: validateResponse.cgp_payment_total,
		comment: "[DOCUMENT COMMENT COMES HERE]",
		transaction_id: validateResponse.cgp_ksys_transacion_id,
		cgp_ids: [validateResponse.cgp_id],
		auto_balance: true /*in case the items sum is different then the total payments, we will add a discount, it helps solve cents calculations problem*/
	};

	let createDocUrl = ENV_URL + '/api/createDoc';
	return new Promise((resolve, reject) => {
		request.post(createDocUrl, {json: createDocData}, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				console.log(body) // Print the shortened url.
				resolve(body);
			} else {
				console.error("Failed");
				console.error(error, response);
				reject(error);
			}
		});
	})
}
