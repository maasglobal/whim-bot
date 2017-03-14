'use strict';
const requests = require('./requests');

const runFactors = (bot, event, context) => {
  if (!event.queryStringParameters) {
    return Promise.resolve( { statusCode: 403, body: 'Expected something else'} );
  }
  const redirect = event.queryStringParameters['redirect_uri'];
  const address = event.queryStringParameters['address'];
  const token = event.queryStringParameters['account_linking_token'];
  var phone = event.queryStringParameters['phone'];
  const path = event.path;

  if (path === '/factor2') {
    phone = `+${unescape(phone)}`;
    let code = event.queryStringParameters['code'];
    console.log('Logging in with', phone, code)
    return requests.login(phone, code)
      .then( (response) => {
      const retVal = {
        statusCode: 301,
        body: '',
        headers: {
          'Content-Type': 'text/html',
          Location: `${FIRST_FACTOR_URL}?${utils.concatenateQueryString(event.queryStringParameters)}`
        }
      };
      var address = JSON.parse(event.queryStringParameters.address);
      return new Promise( (resolve, reject) => {
        bot.beginDialog(address, '/persistUserData', response, (error, resp) => {
          if (error) {
            console.log('ERROR: Redirecting to', retVal.headers.Location);
            return reject(retVal);
          }
          console.log('SUCCESS: Redirecting to', retVal.headers.Location);
          retVal.Location = `${redirect}&authorization_code=${phone.replace('+', '')}`;
          return resolve(retVal);
        });
      });
    });
  } else if (path === '/factor1') {
   
    phone = unescape(phone);
    console.log('requesting code for', phone)

    return requests.requestCode(phone)
      .then( (response, body) => {
      const retVal = {
        statusCode: 301,
        body: '',
      };
      
      //res.redirect(SECOND_FACTOR_URL + '?' + queryString + '&phone=' + phone , next);
      retVal.headers = {
        Location: `${SECOND_FACTOR_URL}?${utils.concatenateQueryString(event.queryStringParameters)}`
      }
      console.log('Redirecting to', retVal.headers);
      retVal.body = '';
      return retVal;
    })
    .catch( err => {
      return {
        statusCode: 301, 
        headers: {
          Location: `${FIRST_FACTOR_URL}?${utils.concatenateQueryString(event.queryStringParameters)}`
        }  
      }
    });

  } else {
    return Promise.reject({ statusCode: 404 });
  }
};

module.exports = runFactors;