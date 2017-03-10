/**
 * Whim-Bot main handler
 */

const builder = require('botbuilder');
const requests = require('./requests.js');

const FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'http://localhost:8080';
const FIRST_FACTOR_URL = FRONTEND_URL + '/index.html';
const SECOND_FACTOR_URL = FRONTEND_URL + '/factor2.html';

const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
const listener = connector.listen();
const intents = new builder.IntentDialog();

// restify mock for lambda
module.exports.listener = require('./serverless.js')(listener);

console.log('Listener is', module.exports.listener.post);

// 1st and 2nd factor auth
module.exports.factors = (event, context, callback) => {
  console.log(event);
  if (event.query['phone'] && event.query['code'] && event.query['address']) {
      
  const code = event.query['code'];
  var phone = event.query['phone'];
  phone = unescape(phone);
  console.log('Logging in with', phone, code)
  requests.login(phone, code, function (error, response, body) {
    const retVal = {
      statusCode: response.statusCode,
      body: "",
    };
    if (error || response.statusCode !== 200) {
      return callback(null, retVal);
    }
    
    bot.beginDialog(event.query['address'], '/persistUserData', body, function (error) {
      retVal.statusCode = 200;
      retVal.body = JSON.stringify({
        phone: phone,
        url: `${SECOND_FACTOR_URL}?&authorization_code=${phone}`
      });
      return callback(null, retVal);
    });
  });

  } else if (event.query['phone']) {
    var phone = event.query['phone'];
    phone = unescape(phone);
    console.log('requesting code for', phone)

    requests.requestCode(phone, function (error, response, body) {
      const retVal = {
        statusCode: response.statusCode,
        body: "",
      };
      if (error || response.statusCode !== 200) {
        return callback(null, retVal);
      }
      //res.redirect(SECOND_FACTOR_URL + '?' + queryString + '&phone=' + phone , next);
      retVal.statusCode = 200;
    
      retVal.body = JSON.stringify({
        phone: phone,
        url: `${SECOND_FACTOR_URL}?phone=${phone}`
      });
      return callback(null, retVal);
    });
  }
};

bot.dialog('/persistUserData', function (session, data) {
  session.userData.user = data;
  session.endDialog();
});

bot.dialog('/', intents);

var handleAccountLinking = function (session) {
  var accountLinking = session.message.sourceEvent.account_linking;
  // This is the handling for the `Account Linking webhook event` where we could
  // verify the authorization_code and that the linking was successful.
  // The authorization_code is the value we passed above and
  // status has value `linked` in case the linking succeeded.
  var username = accountLinking.authorization_code;
  var authorizationStatus = accountLinking.status;
  if (authorizationStatus === 'linked') {
    // TODO: Call Whim API for user info
    session.endDialog('Account linked - you are now known as ' + username);
  } else if (authorizationStatus === 'unlinked') {
    // Remove user from the userData
    delete session.userData.user;
    session.endDialog('Account unlinked');
  } else {
    session.endDialog('Unknown account linking event received');
  }
};

intents.onDefault(function (session) {
  if (session.message.source === 'facebook') {
    if (session.message.sourceEvent.account_linking) {
      handleAccountLinking(session);
      return;
    }
    var storedUser = session.userData.user;
    if (!storedUser) {
      session.beginDialog('/welcome');
      return;
    }
    var entities = session.message.entities;
    if (entities.length > 0 && entities[0].geo) {
      session.beginDialog('/location', entities[0].geo);
      return;
    }
    session.endDialog('To schedule a ride, send a location');
  } else {
    session.endDialog('I am currently expecting to be called from Facebook Messenger');
  }
});

bot.dialog('/welcome', function (session) {
  var message = new builder.Message(session)
    .sourceEvent({
      facebook: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [{
              title: 'Welcome to Whim',
              image_url: FRONTEND_URL + '/static/whim.jpg',
              buttons: [{
                type: 'account_link',
                url: FIRST_FACTOR_URL + '?address=' + JSON.stringify(session.message.address)
              }]
            }]
          }
        }
      }
    });
  session.endDialog(message);
});

var dummyPlaces = {
  Home: {
    latitude: 60.1841495,
    longitude: 24.821329
  },
  Work: {
    latitude: 60.1725727,
    longitude: 24.9307866
  },
  Heureka: {
    latitude: 60.2916418,
    longitude: 25.0117726
  }
};

bot.dialog('/location', [
  function (session, fromLocation) {
    session.dialogData.fromLocation = fromLocation;
    session.beginDialog('/destination', dummyPlaces);
  },
  function (session, results) {
    if (results.response) {
      var toLocation = results.response;
      var fromLocation = session.dialogData.fromLocation;
      requests.routes(
        fromLocation, toLocation,
        session.userData.user.id_token,
        function (error, response, body) {
          session.send('Found ' + body.plan.itineraries.length + ' routes');
          builder.Prompts.confirm(session, 'Do you want to select the shortest?');
        }
      );
    }
  },
  function (session, results) {
    if (results.response) {
      // TODO: Continue based on the response
    }
    session.endDialog('Your ride is on the way...');
  }
]);

bot.dialog('/destination', [
  function (session, choices) {
    session.dialogData.choices = choices;
    builder.Prompts.choice(
      session,
      'Choose or send location to set the destination',
      choices,
      {
        maxRetries: 0
      }
    );
  },
  function (session, results) {
    if (results.response && results.response.entity) {
      var choices = session.dialogData.choices;
      session.endDialogWithResult({
        response: choices[results.response.entity]
      });
    } else if (session.message.entities.length > 0 && session.message.entities[0].geo) {
      session.endDialogWithResult({
        response: session.message.entities[0].geo
      });
    } else {
      session.send('Did not understand the sent location - please try again');
      session.replaceDialog('/destination', session.dialogData.choices);
    }
  }
]);

bot.dialog('/logout', function (session) {
  requests.unlink(session.message.address.user.id, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      // No need to do anything send anything to the user
      // in the success case since we respond only after
      // we have received the account unlinking webhook
      // event from Facebook.
      session.endDialog();
    } else {
      session.endDialog('Error while unlinking account');
    }
  });
});

// Mapping between the action `logout` (defined in `persistent-menu.json`)
// and the /logout dialog defined above.
bot.beginDialogAction('logout', '/logout');

