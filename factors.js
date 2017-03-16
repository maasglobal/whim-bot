'use strict';
const requests = require('./requests');
const utils = require('./utils');
const FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'https://localhost:3000';
const FIRST_FACTOR_URL = FRONTEND_URL + '/index.html';
const SECOND_FACTOR_URL = FRONTEND_URL + '/factor2.html';

const concatenateQueryString = params => {
  const ret = [];
  Object.keys(params).map( key => {
    const val = params[key];
    ret.push( `${key}=${encodeURIComponent(val)}` );
  });

  return ret.join('&');
}

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
          Location: `${FIRST_FACTOR_URL}?${concatenateQueryString(event.queryStringParameters)}`
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
          retVal.headers.Location = `${redirect}&authorization_code=${phone.replace('+', '')}`;
          return resolve(retVal);
        });
      });
    });
  } else if (path === '/factor1') {
   
    phone = unescape(phone);
    console.log('requesting code for', phone)

    return requests.requestCode(phone)
      .then( response => {
      const retVal = {
        statusCode: 301,
        body: '',
      };
      
      retVal.headers = {
        Location: `${SECOND_FACTOR_URL}?${concatenateQueryString(event.queryStringParameters)}`
      }
      console.log('Redirecting to', retVal.headers);
      retVal.body = '';
      return retVal;
    })
    .catch( err => {
      return {
        statusCode: 301, 
        headers: {
          Location: `${FIRST_FACTOR_URL}?${concatenateQueryString(event.queryStringParameters)}`
        }  
      }
    });

  } else {
    return Promise.reject({ statusCode: 404 });
  }
};

module.exports = runFactors;