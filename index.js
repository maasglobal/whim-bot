'use strict';
/**
 * Whim-Bot main handler
 */

const builder = require('botbuilder');
const requests = require('./requests.js');
const Promise = require('bluebird');

const FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'https://localhost:3000';
const FIRST_FACTOR_URL = FRONTEND_URL + '/index.html';
const SECOND_FACTOR_URL = FRONTEND_URL + '/factor2.html';
const MIN_LOCATION_CHARS = 3;

if (!process.env.WHIM_API_KEY) {
  console.log('ERROR: Environment doesnt seem to be properly set');
}
const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
const listener = connector.listen();
const intents = new builder.IntentDialog();

intents.matches('cancel', '/cancel');
intents.matches('quit', '/cancel');
intents.matches('exit', '/cancel');

// restify mock for lambda
module.exports.listener = (event, context, callback) => {
  console.log('Mock Listener handler called with event', event);
  const mock = require('./serverless.js')(listener);
  return mock.post(event, context, callback);
}

const concatenateQueryString = params => {
  const ret = [];
  Object.keys(params).map( key => {
    const val = params[key];
    ret.push( `${key}=${encodeURIComponent(val)}` );
  });

  return ret.join('&');
}

const fetchProfileFavorites = (token) => {
  return new Promise( (resolve, reject) => {
    requests.favorites(token, (err, res) => {
      if (err) return reject(err);
      const arr = {};
      for (const item of res.body.profile.favoriteLocations) {
        arr[item.name] = {
          latitude: item.lat,
          longitude: item.lon,
          name: item.name
        };
      }
      return resolve(arr);
    });
  });
}

const filterTaxi = (itineraries) => {
  let ret = undefined;
  for (const item of itineraries) {
    console.log('Looking for TAXI itinerary', item);
    if (item.legs[0].mode === 'TAXI') {
      console.log('Found a TAXI itinerary', item);
      ret = item;
    }
  }
  return ret;  
}

const filterPT = (itineraries) => {
  let ret = undefined;
  console.log('TODO: filterPT for the best match/score!!');
  for (const item of itineraries) {
    if (!ret && item.fare.points !== null) {
      ret = item;
    }
  }
  return ret;
}

// 1st and 2nd factor auth
module.exports.factors = (event, context, callback) => {
  console.log('factors', event);
  const redirect = event.queryStringParameters['redirect_uri'];
  const address = event.queryStringParameters['address'];
  const token = event.queryStringParameters['account_linking_token'];
  var phone = event.queryStringParameters['phone'];
  const path = event.path;

  if (path === '/factor2') {
    phone = `+${unescape(phone)}`;
    let code = event.queryStringParameters['code'];
    console.log('Logging in with', phone, code)
    requests.login(phone, code, function (error, response, body) {
      const retVal = {
        statusCode: 301,
        body: '',
        headers: {
          'Content-Type': 'text/html',
          Location: `${FIRST_FACTOR_URL}?${concatenateQueryString(event.queryStringParameters)}`
        }
      };
      if (error || response.statusCode !== 200) {
        console.log('Error while logging in', error, 'redirecting to home', retVal);

        return callback(null, retVal);
      }
      var address = JSON.parse(event.queryStringParameters.address);
      bot.beginDialog(address, '/persistUserData', body, function (error) {
        retVal.statusCode = 301;
        
        if (error) {
          console.log('Error persisting accounts', error, address);
          retVal.headers = {
            Location: `${redirect}` //error in linking
          }
        } else {
          retVal.headers = {
            Location: `${redirect}&authorization_code=${phone.replace('+', '')}`
          }
        }
        console.log('Redirecting to', retVal.headers.Location);
        retVal.body = '';
        return callback(null, retVal);
      });
    });

  } else if (path === '/factor1') {
   
    phone = unescape(phone);
    console.log('requesting code for', phone)

    requests.requestCode(phone, function (error, response, body) {
      const retVal = {
        statusCode: 301,
        body: '',
      };
      if (error || response.statusCode !== 200) {
        retVal.headers = {
          Location: `${FIRST_FACTOR_URL}?${concatenateQueryString(event.queryStringParameters)}`
        }
        return callback(null, retVal);
      }
      //res.redirect(SECOND_FACTOR_URL + '?' + queryString + '&phone=' + phone , next);
      retVal.headers = {
        Location: `${SECOND_FACTOR_URL}?${concatenateQueryString(event.queryStringParameters)}`
      }
      console.log('Redirecting to', retVal.headers);
      retVal.body = '';
      return callback(null, retVal);
    });
  } else {
    const retVal = {
      statusCode: 403
    };
    console.log('Why did I not find any useful things?', 'phone is', phone, 'address', address);
    return callback(null, retVal);
  }
};

bot.dialog('/persistUserData', function (session, data) {
  session.userData.user = data;
  session.endDialog();
});

bot.dialog('/cancel', session => {
  session.endConversation();
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
    console.log('Entities received are', entities);

    if (entities.length > 0 && entities[0].geo) {
      const geo = Object.assign({name: 'Pin Location'}, entities[0].geo)
      session.beginDialog('/options', geo);
      return;
    }
    if (session.message.text && session.message.text.length >= MIN_LOCATION_CHARS) {
      // TODO recognize natural language
      switch (session.message.text.toLowerCase()) {
        case 'quit':
        case 'cancel':
        case 'hello':
        case 'hi':
          return session.endDialog('To request a ride, please send your location');
        default:
          break;
      }
      console.log('Searching for a place ', session.message.text)
      session.sendTyping();
      return session.beginDialog('/geosearch', session.message.text);
    }
    session.endDialog('To request a ride, please send your location');
  } else {
    session.endDialog('I am currently expecting to be called from Facebook Messenger');
  }
});

bot.dialog('/welcome', function (session) {
  console.log('Welcome presented as', FIRST_FACTOR_URL + '?address=' + JSON.stringify(session.message.address))
  var message = new builder.Message(session)
    .sourceEvent({
      facebook: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [{
              title: 'Welcome to Whim',
              image_url: 'http://whimapp.com/wp-content/uploads/2017/03/whim.jpg',
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

const filterGeoCollection = coll => {
  if (!coll || !coll.features || coll.features.length < 1) {
    console.log('This wasnt a feature collection');
    return null;
  }
  for (const feature of coll.features) {
    if (feature.type === 'Feature' && 
        feature.properties && 
        feature.properties.name && 
        feature.geometry) {
          console.log('Found a match', JSON.stringify(feature));
      let name = `${feature.properties.name}`;
      if (feature.properties.zipCode && feature.properties.city) {
        name += `(${feature.properties.zipCode} ${feature.properties.city})`;
      }
      return {
        latitude: feature.geometry.coordinates[0],
        longitude: feature.geometry.coordinates[1],
        name: name
      }
    } else {
       console.log('failed', feature.type, feature.properties, feature.properties.name, feature.geometry);
    }
  }
  return null;
}

bot.dialog('/geosearch', [
  (session, text) => {
    requests.geocode(text, 60.169, 24.938, session.userData.user.id_token, (err, results) => {
        const location = filterGeoCollection(results.body);
        console.log('Results from search are', results.body, 'filtered as', location);
        if (err || !location) {
          console.log('ERROR', err);
          return session.endDialog('Could not find that location. Try again.');
        } else {
          const googleURL = `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&size=300x300&zoom=12&markers=${location.latitude},${location.longitude}`
          console.log('Requesting a static map from', googleURL);
          const message = new builder.Message(session)
              .sourceEvent({
                facebook: {
                  attachment: {
                    type: 'template',
                    payload: {
                      template_type: 'generic',
                      elements: [{
                        title: location.name,
                        image_url: googleURL,
                      }]
                    }
                  }
                }
              });
      
          session.send(message);
          
          session.dialogData.location = location;
          builder.Prompts.choice(session,
            `Use ${location.name} as starting point?`,
            {
              OK: session.dialogData.location,
              Retry: {},
            },
            {
              maxRetries: 0
            });
        }
      });
  },
  (session, options) => {
    if (!options.response) {
      return session.endDialog('Please make a selection');
    }
    if (options.response.index !== 0) {
      return session.endDialog('Ok, please specify a location again.')
    }
    // TODO send the location as a GEO object in the mean time
    session.beginDialog('/options', session.dialogData.location);
  }
]);

bot.dialog('/options', [(session, fromLocation) => {
  session.dialogData.fromLocation = fromLocation;
  session.dialogData.choices = {
    routes: {

    },
    restaurants: {

    },
    pizza: {

    }
  };
  builder.Prompts.choice(
      session,
      `Choose action (${fromLocation.name} as starting point)`,
      session.dialogData.choices,
      {
        maxRetries: 0
      }
    );
},
(session, options) => {
  console.log('options were', options.response, 'and message', session.message.text);
  const param = session.dialogData.fromLocation;
  if (options.response) {
    param.kind = options.response.entity;
    switch (options.response.index) {
      case 0:
        return session.beginDialog('/location', param); 
      case 1:
      case 2:
        console.log('Moving to /food to search for', param);
        return session.beginDialog('/food', param); 
      default:
        return session.replaceDialog('/options', param); 
    }
  } else if(['quit','stop','cancel','help'].indexOf(session.message.text) != -1) {
      return session.endDialog('Ok, start over by sending a location.');
  } else {
    param.kind =  session.message.text;
    console.log('Moving to /food to search for', param);
    return session.beginDialog('/food', param); 
  }
}
]);
const kFormatter = num => {
    return num > 999 ? (num/1000).toFixed(1) + 'k' : Math.floor(num) + 'm'
}

bot.dialog('/food', [
  (session, location) => {
    const kind = location.kind;
    console.log(kind, 'for location', location);
    if (!location) {
      return session.endDialog('Need a location');
    }
    session.dialogData.fromLocation = location;
    session.sendTyping();
    requests.places(kind, location.latitude, location.longitude, (err, results) => {
      if (err) { return session.endDialog('Error finding restaurants'); }
      if (!results.body.businesses || results.body.businesses.length < 1 ) {
        return session.endDialog('Did not find restaurants');
      }
      const choices = {};
      const rand = Math.floor(Math.random() * 100) % results.body.businesses.length;
      const choice = results.body.businesses[rand];
      console.log('Selected option', choice);
      const message = new builder.Message(session)
          .sourceEvent({
            facebook: {
              attachment: {
                type: 'template',
                payload: {
                  template_type: 'generic',
                  elements: [{
                    title: choice.name,
                    subtitle: `${choice.price} - ${choice.rating} Yelp rating - ${kFormatter(choice.distance)} away`,
                    image_url: choice.image_url,
                    buttons: [{
                      type: 'web_url',
                      url: choice.url,
                      title: 'Visit Yelp Site'
                    }]
                  }]
                }
              }
            }
          });
  
      session.send(message);
      choices[choice.name] = choice;
      choices['Shuffle again!'] = {};
      session.dialogData.choices = choices;
      builder.Prompts.choice(
          session,
          'Make a selection',
          choices,
          {
            maxRetries: 0
          }
      );
    })
  },
  (session, options) => {
    console.log('Selection was', options);
    if (options.response && options.response.index === 0) {
      const coords = Object.assign( { name: options.response.entity }, session.dialogData.choices[options.response.entity].coordinates);
      const fromLocation = session.dialogData.fromLocation;
      fromLocation.toLocation = coords;
      return session.beginDialog('/location', fromLocation );     
    } 
    if (options.response && options.response.index === 1) {
      return session.replaceDialog('/food', session.dialogData.fromLocation);     
    } 
    return session.endDialog('Ok, where else would you like to look?');     
  }
])

bot.dialog('/location', [
  function (session, fromLocation) {
    session.dialogData.fromLocation = fromLocation;
    console.log('fromLocation', fromLocation);
    session.send(`Planning a route from ${fromLocation.name}`);
    session.sendTyping();
    if (fromLocation && fromLocation.toLocation) {
        return session.beginDialog('/destination', fromLocation);
    }
    fetchProfileFavorites(session.userData.user.id_token)
      .then( favorites => {
        console.log('Profile info', favorites);
        session.beginDialog('/destination', favorites);
      })
      .catch( err => {
        console.log('Error fetching profile', err);
        session.endDialog('Had an error while fetching favorites');
      });
  },
  function (session, results) {
    console.log('User choice for to-location', results)
    if (results.response) {
      var toLocation = results.response;
      session.dialogData.toLocation = toLocation;
      var fromLocation = session.dialogData.fromLocation;
      session.send(`Searching for routes from ${fromLocation.name} to ${toLocation.name}`);
      session.sendTyping();
      requests.routes(
        fromLocation, toLocation,
        session.userData.user.id_token,
        function (error, response, body) {
          session.dialogData.taxiPlan = filterTaxi(body.plan.itineraries);
          session.dialogData.ptPlan = filterPT(body.plan.itineraries);
          if (!session.dialogData.ptPlan) {
            return session.endDialog(`Did not find routes to ${toLocation.name}`);
          } 
          session.send('Found ' + body.plan.itineraries.length + ' routes');
          const topItin = session.dialogData.ptPlan;
          console.log('Itinerary', topItin);
          builder.Prompts.confirm(session, `Do you want to select the fastest Public Transport option - ${topItin.fare.points} points?`);
        }
      );
    }
  },
  function (session, results) {
    if (results.response) {
      // TODO: Continue based on the response
      // FIXME Continue how?
      console.log('Response to the session is', results);
      return requests.book(session.dialogData.ptPlan, session.userData.user.id_token, (err, res) => {
        if (err) {
          console.log('ERROR booking trip', err);
          return session.endDialog('Error booking your trip');
        }
        return session.endDialog('Your ride is booked - check your Whim-app!');
      })
      
    } 
    if (session.dialogData.taxiPlan) {
      const topItin = session.dialogData.taxiPlan;
      return builder.Prompts.confirm(session, `Do you want to order a TAXI instead - ${topItin.fare.points} points?`);
    }
    return session.endDialog('Ok. Please throw an another challenge!');
  },
  function (session, results) {
    console.log('')
    if (results.response) {
      // TODO: Continue based on the response
      // FIXME Continue how?
      console.log('Response to the Taxi question is', results);
      return requests.book(session.dialogData.taxiPlan, session.userData.user.id_token, (err, res) => {
        if (err) {
          console.log('ERROR booking trip', err);
          return session.endDialog('Error booking your trip');
        }
        return session.endDialog('Your ride is booked - check your Whim-app!');
      })
    } 
    session.endDialog('Ok, please select another starting point!');
  }
]);


bot.dialog('/destination', [
  function (session, choices) {
    session.dialogData.choices = choices;
    if (choices.toLocation) {
      console.log('destination had toLocation', choices.toLocation);
      return session.endDialogWithResult({
        response: choices.toLocation
      });
    }
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
    console.log('Destination response', results);
    if (results.response && results.response.entity) {
      var choices = session.dialogData.choices;
      session.endDialogWithResult({
        response: choices[results.response.entity]
      });
    } else if (session.message.entities.length > 0 && session.message.entities[0].geo) {
      const geo = Object.assign({ name: 'Pin Location' }, session.message.entities[0].geo);
      session.endDialogWithResult({
        response: geo
      });
    } else if (session.message.text && session.message.text.length >= MIN_LOCATION_CHARS) {
      console.log('Searching for a place ', session.message.text)
      session.sendTyping();
      return requests.geocode(session.message.text, 60.169, 24.938, session.userData.user.id_token, (err, results) => {
        console.log('Results from search are', results.body);
        const location = filterGeoCollection(results.body);
        if (err || !location) {
          console.log('ERROR', err);
          session.send('Did not understand the sent location - please try again');
          session.replaceDialog('/destination', session.dialogData.choices);
        } else {
          session.dialogData.location = location;
          const googleURL = `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&size=300x300&zoom=12&markers=${location.latitude},${location.longitude}`
          console.log('Requesting a static map from', googleURL);
          const message = new builder.Message(session)
              .sourceEvent({
                facebook: {
                  attachment: {
                    type: 'template',
                    payload: {
                      template_type: 'generic',
                      elements: [{
                        title: location.name,
                        image_url: googleURL,
                      }]
                    }
                  }
                }
              });
      
          session.send(message);
                    
          builder.Prompts.choice(session,
            `Use ${location.name} as destination?`,
            {
              OK: session.dialogData.location,
              retry: {},
            },
            {
              maxRetries: 0
            });
        }
      });
    } else {
      session.send('Did not understand the sent location - please try again');
      session.replaceDialog('/destination', session.dialogData.choices);
    }
  },
  (session, options) => {
    if (!options.response) {
      return session.endDialog('Please make a selection OK or retry');
    }
    if (options.response.index !== 0) {
      return session.endDialog('Ok, please specify a location again.')
    }
   return session.endDialogWithResult({
     response: session.dialogData.location
    });
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

