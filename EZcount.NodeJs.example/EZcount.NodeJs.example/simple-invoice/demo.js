var request = require('request');


// register to demo.ezcount.co.il to get your own test keys
var api_key = '4c4b3fd224e0943891588ea5a70d6cb566af3a5b4d506908ca04b30526234551'
var api_email = 'demo@ezcount.co.il'
    // DEVELOPER information, we will notify you for any API problem to this details
var developer_email = 'DEVELOPER@example.com'
var developer_phone = '05012345678'


// before deploying to production, please contact support and ask for your own unique dev_master_ke
var dev_master_key = '4146fe70-01bd-11e7-965d-04011c5ad201';

var url = 'https://demo.ezcount.co.il/api/createDoc'

var data = {
    // CUSTOMER credentials
    api_key: api_key,
    api_email: api_email,
    // developer data
    developer_email: developer_email,
    developer_phone: developer_phone,
	// developer identifier and permissions key
	// dev_master_key:dev_master_key,
    // invoice reciept
    type: 320,
    description: "Monthly payment for service",
    customer_name: "customer name",
    customer_email: "client@demo.com",
    customer_address: "Full customer address, city, and house num 42",
    item: [{
        catalog_number: "MKT1",
        details: "item details",
        amount: 1,
        price: 255,
        //this price include the VAT 
        vat_type: "INC"
    }],
    payment: [{
        // bank transfer
        payment_type: 4,
        payment: 255,
        comment: "transaction number is 23423423"
    }],
    // THIS IS A MUST ONLY IN INVOICE RECIEPT
    price_total: 255,
    comment: "some general comment for the document",
}

//actual send request
request.post(url, { form: data, json: true }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
        console.log(body) // Print the shortened url.
    } else {
        console.error("Failed");
        console.error(error, response);
    }
});