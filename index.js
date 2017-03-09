var restify = require('restify');
var builder = require('botbuilder');

var requests = require('./requests.js');

var FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'https://localhost';
var FIRST_FACTOR_URL = FRONTEND_URL + '/static/factor1.html';
var SECOND_FACTOR_URL = FRONTEND_URL + '/static/factor2.html';

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);

server.post('/api/messages', connector.listen());

server.post('/factor1', restify.bodyParser(), function (req, res, next) {
  var splitBody = req.body.split('phone=');
  if (splitBody.length < 2) {
    return res.send(400, 'Request did not contain phone in the body');
  }
  var phone = splitBody[1];
  phone = unescape(phone);

  requests.requestCode(phone, function (error, response, body) {
    var queryString = req.url.split('?')[1];
    if (error || response.statusCode !== 200) {
      // In case of errors, redirect back to the first factor page.
      // TODO: Inform user about the errors.
      return res.redirect(FIRST_FACTOR_URL + '?' + queryString, next);
    }
    res.redirect(SECOND_FACTOR_URL + '?' + queryString + '&phone=' + phone , next);
  });
});

server.post('/factor2', restify.queryParser(), restify.bodyParser(), function (req, res, next) {
  var splitBody = req.body.split('code=');
  if (splitBody.length < 2) {
    return res.send(400, 'Request did not contain code in the body');
  }
  var code = splitBody[1];
  var phone = req.query.phone;

  requests.login(phone, code, function (error, response, body) {
    var queryString = req.url.split('?')[1];
    if (error || response.statusCode !== 200) {
      return res.redirect(SECOND_FACTOR_URL + '?' + queryString, next);
    }
    var address = JSON.parse(req.query.address);
    bot.beginDialog(address, '/persistUserData', body, function (error) {
      var redirectUri = req.query.redirect_uri + '&authorization_code=' + phone;
      res.redirect(redirectUri, next);
    });
  });
});

bot.dialog('/persistUserData', function (session, data) {
  session.userData.user = data;
  session.endDialog();
});

server.get(/\/static\/?.*/, restify.serveStatic({
  directory: __dirname
}));

var intents = new builder.IntentDialog();
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

